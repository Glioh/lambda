"use client";

import {
	ACCEPTED_IMAGE_TYPES,
	MAX_IMAGE_EDGE,
	MAX_SOURCE_BYTES,
	REENCODE_QUALITY,
	type AcceptedImageType,
	type AttachmentInput,
} from "../constants";

/**
 * Narrows a browser-reported mime type to one the server will accept.
 * @param {string} type - The blob's reported type.
 * @returns {boolean} True when the type is on the allowlist.
 */
const isAcceptedType = (type: string): type is AcceptedImageType =>
	(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);

export interface PreparedImage extends AttachmentInput {
	byteSize: number;
	/** Object URL for the local preview thumbnail; revoke when discarding. */
	previewUrl: string;
	fileName: string;
}

/**
 * Downscales and re-encodes an image in the browser before upload.
 *
 * Doing this client-side is what makes base64-in-Postgres viable: a 6 MB phone
 * screenshot becomes a few hundred KB, so the request stays far under the
 * platform body limit and the row stays a reasonable size. It also caps the
 * long edge at the point beyond which the model gains no additional detail.
 *
 * @param {File} file - The user's selected image.
 * @returns {Promise<PreparedImage>} The encoded attachment plus preview metadata.
 * @throws {Error} When the file is the wrong type, too large, or undecodable.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
	if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
		throw new Error(`${file.name}: unsupported image type.`);
	}

	if (file.size > MAX_SOURCE_BYTES) {
		throw new Error(
			`${file.name} is over ${Math.floor(MAX_SOURCE_BYTES / 1024 / 1024)}MB.`,
		);
	}

	const bitmap = await createImageBitmap(file).catch(() => {
		throw new Error(`${file.name} couldn't be read as an image.`);
	});

	try {
		const scale = Math.min(
			1,
			MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
		);
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));

		// Animated GIFs lose their animation through a canvas. That's an accepted
		// trade: the model only ever sees one frame anyway.
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext("2d");

		if (!context) {
			throw new Error("Your browser couldn't process this image.");
		}

		context.drawImage(bitmap, 0, 0, width, height);

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/webp", REENCODE_QUALITY),
		);

		if (!blob) {
			throw new Error(`${file.name} couldn't be encoded.`);
		}

		const buffer = await blob.arrayBuffer();

		return {
			// Take the type from the blob, not the requested one. `toBlob` silently
			// falls back to PNG where WebP encoding isn't supported, and declaring
			// a type the bytes don't match fails the server's magic-byte check.
			mimeType: isAcceptedType(blob.type) ? blob.type : "image/webp",
			data: toBase64(buffer),
			width,
			height,
			byteSize: buffer.byteLength,
			previewUrl: URL.createObjectURL(blob),
			fileName: file.name,
		};
	} finally {
		bitmap.close();
	}
}

/**
 * Base64-encodes a buffer without a data-URL prefix.
 * Chunked because spreading a multi-megabyte array into String.fromCharCode
 * blows the argument limit.
 * @param {ArrayBuffer} buffer - The bytes to encode.
 * @returns {string} The base64 payload.
 */
function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const CHUNK = 0x8000;
	let binary = "";

	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}

	return btoa(binary);
}
