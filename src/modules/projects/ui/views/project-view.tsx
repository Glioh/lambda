"use client";

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTRPC } from "@/trpc/client";
import { MessagesContainer } from "../components/messages-container";
import { Suspense, useState } from "react";
import { Fragment } from "@/generated/prisma/browser";
import { ProjectHeader } from "../components/project-header";
import { FragmentWeb } from "../components/fragment-web";
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { EyeIcon, CodeIcon, CrownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { useAuth } from "@clerk/nextjs";
import { ErrorBoundary } from "react-error-boundary";

interface Props {
	projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
	const [autoActiveFragment, setAutoActiveFragment] = useState<Fragment | null>(
		null,
	);
	const [userActiveFragment, setUserActiveFragment] = useState<Fragment | null>(
		null,
	);
	const activeFragment = userActiveFragment ?? autoActiveFragment;

	const [tabState, setTabState] = useState<"preview" | "code">("preview");

	const handleUserSelectFragment = (fragment: Fragment | null) => {
		setUserActiveFragment(fragment);
	};

	const handleAutoSelectFragment = (fragment: Fragment | null) => {
		setAutoActiveFragment(fragment);
		setUserActiveFragment(null);
	};

	const handleUserMessageSendStart = () => {
		setAutoActiveFragment(null);
		setUserActiveFragment(null);
	};

	const trpc = useTRPC();
	const { has, isLoaded } = useAuth();
	const hasProAccess = isLoaded ? has?.({ plan: "pro" }) : undefined;

	return (
		<div className="h-screen">
			<ResizablePanelGroup direction="horizontal">
				<ResizablePanel
					defaultSize={35}
					minSize={20}
					className="flex flex-col min-h-0"
				>
					<ErrorBoundary fallback={<p>Error loading project header</p>}>
						<Suspense fallback={<p>Loading project...</p>}>
							<ProjectHeader projectId={projectId} />
						</Suspense>
					</ErrorBoundary>
					<ErrorBoundary fallback={<p>Error loading project header</p>}>
						<Suspense fallback={<p>Loading messages...</p>}>
							<MessagesContainer
								projectId={projectId}
								activeFragment={activeFragment}
								onUserSelectFragment={handleUserSelectFragment}
								onAutoSelectFragment={handleAutoSelectFragment}
								onUserMessageSendStart={handleUserMessageSendStart}
							/>
						</Suspense>
					</ErrorBoundary>
				</ResizablePanel>
				<ResizableHandle className="hover:bg-primary transition-colors" />
				<ResizablePanel
					defaultSize={65}
					minSize={50}
					className="flex flex-col min-h-0"
				>
					<Tabs
						className="h-full w-full gap-y-0"
						defaultValue="preview"
						value={tabState}
						onValueChange={(value) => setTabState(value as "preview" | "code")}
					>
						<div className="w-full flex items-center p-2 border-b gap-x-2">
							<TabsList className="h-8 p-0 border rounded-md">
								<TabsTrigger value="preview" className="rounded-md">
									<EyeIcon /> <span>Demo</span>
								</TabsTrigger>
								<TabsTrigger value="code" className="rounded-md">
									<CodeIcon /> <span>Code</span>
								</TabsTrigger>
							</TabsList>
							<div className="ml-auto flex items-center gap-x-2">
								{isLoaded && !hasProAccess && (
									<Button asChild size="sm" variant="tertiary">
										<Link href="/pricing">
											<CrownIcon /> Upgrade
										</Link>
									</Button>
								)}
								<UserControl />
							</div>
						</div>
						<TabsContent value="preview">
							{!!activeFragment && <FragmentWeb data={activeFragment} />}
						</TabsContent>
						<TabsContent value="code" className="min-h-0">
							{!!activeFragment?.files && (
								<FileExplorer
									files={activeFragment.files as { [path: string]: string }}
								/>
							)}
						</TabsContent>
					</Tabs>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
};
