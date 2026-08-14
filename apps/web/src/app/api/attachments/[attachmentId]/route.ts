import { prisma } from "@/lib/db";
import { resolveUserId } from "@/lib/dev-auth";

/**
 * Serves an attachment's bytes.
 *
 * This exists so image payloads never travel through tRPC: `messages.getMany`
 * is re-fetched on a poll while a response streams, and putting megabytes of
 * base64 in that response would be re-serialized through superjson every time.
 * Serving them here also gets HTTP caching for free.
 *
 * @param {Request} _request - Unused; the id comes from the route segment.
 * @param {{ params: Promise<{ attachmentId: string }> }} context - Route params.
 * @returns {Promise<Response>} The image bytes, or 401/404.
 */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ attachmentId: string }> },
) {
	const userId = await resolveUserId();

	if (!userId) {
		return new Response("Not authenticated", { status: 401 });
	}

	const { attachmentId } = await params;

	// Ownership is enforced through the relation chain, so one query answers
	// both "does it exist" and "may this user see it" — and a miss on either
	// returns the same 404, which avoids confirming that an id exists.
	const attachment = await prisma.attachment.findFirst({
		where: {
			id: attachmentId,
			message: { project: { userId } },
		},
		select: { mimeType: true, data: true },
	});

	if (!attachment) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(Buffer.from(attachment.data, "base64") as BodyInit, {
		headers: {
			// Safe to echo: mimeType is allowlist- and magic-byte-validated at
			// write time. `nosniff` is the third layer of that same defense.
			"Content-Type": attachment.mimeType,
			"Content-Disposition": "inline",
			"X-Content-Type-Options": "nosniff",
			// Attachments are immutable and keyed by uuid, so this can be
			// cached indefinitely. `private` keeps it out of shared caches.
			"Cache-Control": "private, max-age=31536000, immutable",
		},
	});
}
