"use client";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react";
import { useState } from "react";

interface SandboxPreviewProps {
	sandboxUrl: string;
	title?: string;
}

export function SandboxPreview({ sandboxUrl }: SandboxPreviewProps) {
	const [copied, setCopied] = useState(false);
	const [frameKey, setFrameKey] = useState(0);

	const onRefresh = () => {
		setFrameKey((prev) => prev + 1);
	};

	const handleCopy = () => {
		navigator.clipboard
			.writeText(sandboxUrl)
			.then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			})
			.catch((err) => {
				console.error("Failed to copy URL:", err);
			});
	};

	return (
		<div className="flex flex-col w-full h-full">
			<div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
				<Hint text="Refresh" side="bottom" align="start">
					<Button size="sm" variant="outline" onClick={onRefresh}>
						<RefreshCcwIcon />
					</Button>
				</Hint>
				<Hint text="Copy URL" side="bottom">
					<Button
						size="sm"
						variant="outline"
						onClick={handleCopy}
						disabled={!sandboxUrl || copied}
						className="flex-1 justify-start text-start font-normal"
					>
						<span className="truncate">{sandboxUrl}</span>
					</Button>
				</Hint>
				<Hint text="Open in new tab" side="bottom" align="start">
					<Button
						size="sm"
						disabled={!sandboxUrl}
						variant="outline"
						onClick={() => {
							if (!sandboxUrl) return;
							window.open(sandboxUrl, "_blank");
						}}
					>
						<ExternalLinkIcon />
					</Button>
				</Hint>
			</div>
			{sandboxUrl ? (
				<iframe
					key={frameKey}
					className="h-full w-full"
					sandbox="allow-forms allow-scripts allow-same-origin"
					loading="lazy"
					src={sandboxUrl}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
					No preview available
				</div>
			)}
		</div>
	);
}
