// External dependencies
import { Prisma, type PrismaClient } from "@prisma/client";

const artifactVersionWithFilesInclude = {
	files: {
		orderBy: {
			path: "asc",
		},
	},
} satisfies Prisma.ArtifactVersionInclude;

type ArtifactVersionWithFiles = Prisma.ArtifactVersionGetPayload<{
	include: typeof artifactVersionWithFilesInclude;
}>;

type ArtifactVersionListItem = Prisma.ArtifactVersionGetPayload<{
	select: {
		id: true;
		version: true;
		runId: true;
		sandboxUrl: true;
		title: true;
		createdAt: true;
		_count: {
			select: {
				files: true;
			};
		};
	};
}>;

type PrismaArtifactClient = Pick<PrismaClient, "$transaction" | "artifactVersion">;

export interface ArtifactVersionPayload {
	id: string;
	version: number;
	runId: string;
	sandboxUrl: string | null;
	title: string | null;
	createdAt: Date;
	files: Record<string, string>;
}

export interface ArtifactVersionListPayload {
	id: string;
	version: number;
	runId: string;
	sandboxUrl: string | null;
	title: string | null;
	createdAt: Date;
	fileCount: number;
}

export interface CreateArtifactVersionInput {
	projectId: string;
	runId: string;
	sandboxUrl: string | null;
	title: string | null;
	files: Record<string, string>;
}

function toFileMap(files: ArtifactVersionWithFiles["files"]) {
	return Object.fromEntries(
		files.map((file) => [file.path, file.content]),
	);
}

/**
 * Converts an artifact version row with file records into the payload shape
 * expected by the application layer.
 * @param {ArtifactVersionWithFiles} artifactVersion - Prisma row including files.
 * @returns {ArtifactVersionPayload} The mapped artifact version payload.
 */
export function toArtifactVersionPayload(
	artifactVersion: ArtifactVersionWithFiles,
): ArtifactVersionPayload {
	return {
		id: artifactVersion.id,
		version: artifactVersion.version,
		runId: artifactVersion.runId,
		sandboxUrl: artifactVersion.sandboxUrl,
		title: artifactVersion.title,
		createdAt: artifactVersion.createdAt,
		files: toFileMap(artifactVersion.files),
	};
}

function toArtifactVersionListPayload(
	artifactVersion: ArtifactVersionListItem,
): ArtifactVersionListPayload {
	return {
		id: artifactVersion.id,
		version: artifactVersion.version,
		runId: artifactVersion.runId,
		sandboxUrl: artifactVersion.sandboxUrl,
		title: artifactVersion.title,
		createdAt: artifactVersion.createdAt,
		fileCount: artifactVersion._count.files,
	};
}

/**
 * Creates a new artifact version record and increments the version counter.
 * The operation is performed inside a serializable transaction to guarantee
 * correct version sequencing for the same project.
 * @param {PrismaArtifactClient} prisma - Prisma client with artifactVersion access.
 * @param {CreateArtifactVersionInput} input - Input data for the new artifact version.
 * @returns {Promise<ArtifactVersionPayload>} The created artifact version payload.
 */
export async function createArtifactVersion(
	prisma: PrismaArtifactClient,
	input: CreateArtifactVersionInput,
): Promise<ArtifactVersionPayload> {
	return prisma.$transaction(
		async (tx) => {
			const artifact = await tx.artifact.upsert({
				where: {
					projectId: input.projectId,
				},
				create: {
					projectId: input.projectId,
				},
				update: {},
			});

			const latestVersion = await tx.artifactVersion.findFirst({
				where: {
					artifactId: artifact.id,
				},
				orderBy: {
					version: "desc",
				},
				select: {
					version: true,
				},
			});

			const createdVersion = await tx.artifactVersion.create({
				data: {
					artifactId: artifact.id,
					runId: input.runId,
					sandboxUrl: input.sandboxUrl,
					title: input.title,
					version: (latestVersion?.version ?? 0) + 1,
					files: {
						create: Object.entries(input.files).map(([path, content]) => ({
							path,
							content,
						})),
					},
				},
				include: artifactVersionWithFilesInclude,
			});

			return toArtifactVersionPayload(createdVersion);
		},
		{
			isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
		},
	);
}

/**
 * Fetches the latest artifact version for a project by version and created date.
 * @param {Pick<PrismaClient, "artifactVersion">} prisma - Prisma client with artifactVersion access.
 * @param {string} projectId - The project ID whose latest artifact version is requested.
 * @returns {Promise<ArtifactVersionPayload | null>} The latest artifact version payload or null.
 */
export async function getLatestArtifactVersion(
	prisma: Pick<PrismaClient, "artifactVersion">,
	projectId: string,
): Promise<ArtifactVersionPayload | null> {
	const artifactVersion = await prisma.artifactVersion.findFirst({
		where: {
			artifact: {
				projectId,
			},
		},
		orderBy: [
			{
				version: "desc",
			},
			{
				createdAt: "desc",
			},
		],
		include: artifactVersionWithFilesInclude,
	});

	return artifactVersion ? toArtifactVersionPayload(artifactVersion) : null;
}

/**
 * Fetches a specific artifact version by project and version number.
 * @param {Pick<PrismaClient, "artifactVersion">} prisma - Prisma client with artifactVersion access.
 * @param {string} projectId - The project ID owning the artifact.
 * @param {number} version - The version number to fetch.
 * @returns {Promise<ArtifactVersionPayload | null>} The artifact version payload or null.
 */
export async function getArtifactVersionByNumber(
	prisma: Pick<PrismaClient, "artifactVersion">,
	projectId: string,
	version: number,
): Promise<ArtifactVersionPayload | null> {
	const artifactVersion = await prisma.artifactVersion.findFirst({
		where: {
			version,
			artifact: {
				projectId,
			},
		},
		include: artifactVersionWithFilesInclude,
	});

	return artifactVersion ? toArtifactVersionPayload(artifactVersion) : null;
}

/**
 * Lists artifact versions for a project, including file count metadata.
 * @param {Pick<PrismaClient, "artifactVersion">} prisma - Prisma client with artifactVersion access.
 * @param {string} projectId - The project ID to list artifact versions for.
 * @returns {Promise<ArtifactVersionListPayload[]>} The list of artifact version metadata.
 */
export async function listArtifactVersions(
	prisma: Pick<PrismaClient, "artifactVersion">,
	projectId: string,
): Promise<ArtifactVersionListPayload[]> {
	const artifactVersions = await prisma.artifactVersion.findMany({
		where: {
			artifact: {
				projectId,
			},
		},
		orderBy: {
			version: "desc",
		},
		select: {
			id: true,
			version: true,
			runId: true,
			sandboxUrl: true,
			title: true,
			createdAt: true,
			_count: {
				select: {
					files: true,
				},
			},
		},
	});

	return artifactVersions.map(toArtifactVersionListPayload);
}
