/** Lambda-owned authenticated request identity. */
export type AuthPrincipal = {
	userId: string;
	sessionId: string | null;
};
