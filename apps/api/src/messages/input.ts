import type { AttachmentInput } from "../attachments/policy.js";
import { ApplicationError } from "../application-error.js";
import { AttachmentValidationError, validateAttachments } from "../attachments/validation.js";

export type MessageInput = { value: string; attachments?: AttachmentInput[] };
export function messageAttachments(input: MessageInput) {
	if (!input.value.trim() && !input.attachments?.length)
		throw new ApplicationError("INVALID_INPUT", "Message cannot be empty.");
	try {
		return validateAttachments(input.attachments ?? []);
	} catch (error) {
		throw new ApplicationError(
			"INVALID_INPUT",
			error instanceof AttachmentValidationError ? error.message : "Attachments are invalid.",
		);
	}
}
