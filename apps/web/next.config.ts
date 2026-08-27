import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@lambda/api-client", "@lambda/api-contracts"],
	async rewrites() {
		const apiUrl = process.env.API_URL ?? "http://localhost:4000";
		return [
			{
				source: "/api/projects/:path*",
				destination: `${apiUrl}/api/projects/:path*`,
			},
			{
				source: "/api/usage",
				destination: `${apiUrl}/api/usage`,
			},
		];
	},
};

export default nextConfig;
