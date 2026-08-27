export type RequestErrorDetails = {
	message: string;
	status?: number;
	code?: string;
};

/**
 * Converts an API request error into a structured object containing the error message, status code, and error code if available.
 * @param error The error object thrown during the API request.
 * @returns An object containing the error message, status code, and error code if available.
 */
export function getRequestErrorDetails(error: unknown): RequestErrorDetails {
	if (!(error instanceof Error)) return { message: "API request failed." }; // if not error shape, return generic message

	const responseError = error as Error & {
		status?: unknown;
		data?: unknown;
	};
	const data =
		responseError.data && typeof responseError.data === "object"
			? (responseError.data as { code?: unknown; message?: unknown })
			: undefined;

	return {
		message:
			typeof data?.message === "string" ? data.message : error.message || "API request failed.",
		status: typeof responseError.status === "number" ? responseError.status : undefined,
		code: typeof data?.code === "string" ? data.code : undefined,
	};
}
