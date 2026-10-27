export type ApplicationErrorCode =
	"INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "USAGE_LIMIT_EXCEEDED";

export class ApplicationError extends Error {
	constructor(
		public readonly code: ApplicationErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ApplicationError";
	}
}
