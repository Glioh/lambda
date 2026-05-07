"use client";

import type { Fragment } from "@prisma/client";
import { SandboxPreview } from "./sandbox-preview";

interface Props {
	data: Fragment;
}

export function FragmentWeb({ data }: Props) {
	if (!data.sandboxUrl) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				No preview available
			</div>
		);
	}

	return <SandboxPreview sandboxUrl={data.sandboxUrl} title={data.title} />;
}
