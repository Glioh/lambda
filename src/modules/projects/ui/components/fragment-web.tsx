import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Fragment } from "@/generated/prisma/client";
import { ExternalLinkIcon, RefreshCcwIcon } from "lucide-react";
import { useState } from "react";

interface Props {
	data: Fragment;
}

export function FragmentWeb({ data }: Props) {
	const [copied, setCopied] = useState(false);
	const [fragmentKey, setFragmentKey] = useState(0);

	const onRefresh = () => {
		setFragmentKey((prev) => prev + 1);
	};

	const handleCopy = () => {
		navigator.clipboard
			.writeText(data.sandboxUrl)
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
						disabled={!data.sandboxUrl || copied}
						className="flex-1 justify-start text-start font-normal"
					>
						<span className="truncate">{data.sandboxUrl}</span>
					</Button>
				</Hint>
				<Hint text="Open in new tab" side="bottom" align="start">
					<Button
						size="sm"
						disabled={!data.sandboxUrl}
						variant="outline"
						onClick={() => {
							if (!data.sandboxUrl) return;
							window.open(data.sandboxUrl, "_blank");
						}}
					>
						<ExternalLinkIcon />
					</Button>
				</Hint>
			</div>
			{data.sandboxUrl ? (
				<iframe
					key={fragmentKey}
					className="h-full w-full"
					sandbox="allow-forms allow-scripts allow-same-origin"
					loading="lazy"
					src={data.sandboxUrl}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
					No preview available
				</div>
			)}
		</div>
	);
}
