import { MAX_TOTAL_ATTACHMENT_BYTES } from "@lambda/api-contracts";

// Base64 expands decoded bytes by 4/3. Extra room covers JSON and metadata.
export const ATTACHMENT_REQUEST_BODY_LIMIT =
	Math.ceil((MAX_TOTAL_ATTACHMENT_BYTES * 4) / 3) + 64 * 1024;
