export const DEFAULT_HOST = "localhost";
export const DEFAULT_PORT = 4000;

export type ServerConfig = {
	host: string;
	port: number;
};

/** Resolves API_HOST/API_PORT (or HOST/PORT) with localhost:4000 defaults. */
export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
	const host = env.API_HOST ?? env.HOST ?? DEFAULT_HOST;
	const rawPort = env.API_PORT ?? env.PORT;
	const port = rawPort === undefined ? DEFAULT_PORT : Number(rawPort);

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid API port: ${rawPort ?? "undefined"}`);
	}

	return { host, port };
}

export const serverConfig = getServerConfig();
