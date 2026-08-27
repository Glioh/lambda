import "server-only";

import { headers } from "next/headers";
import { createApiClient } from "@lambda/api-client/client";

const apiUrl = () =>
	(process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
		/\/$/,
		"",
	);

/**
 * Creates a server-side API client with forwarded headers from the incoming request.
 */
export async function createServerApiClient() {
	const incoming = await headers();
	const forwarded: Record<string, string> = {};
	for (const name of ["cookie", "authorization"]) {
		const value = incoming.get(name);
		if (value) forwarded[name] = value;
	}

	return createApiClient({ baseURL: apiUrl(), headers: forwarded });
}
