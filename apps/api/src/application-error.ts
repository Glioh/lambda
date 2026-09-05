export class ApplicationError extends Error {
	constructor(
		public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "USAGE_LIMIT_EXCEEDED",
		message: string,
	) {
		super(message);
	}
}
