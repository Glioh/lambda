"use client";

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { MessagesContainer } from "../components/messages-container";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Fragment } from "@prisma/client";
import { ProjectHeader } from "../components/project-header";
import { FragmentWeb } from "../components/fragment-web";
import { SandboxPreview } from "../components/sandbox-preview";
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { EyeIcon, CodeIcon, CrownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileExplorer } from "@/components/file-explorer";
import { UserControl } from "@/components/user-control";
import { useAuth } from "@clerk/nextjs";
import { ErrorBoundary } from "react-error-boundary";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useProjectRuns } from "@/modules/routing/ui/hooks/use-project-runs";
import { useRunActions } from "@/modules/routing/ui/hooks/use-run-actions";
import { RunProvider } from "@/modules/routing/ui/context/run-context";
import type { ImperativePanelHandle } from "react-resizable-panels";

interface Props {
	projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
	const trpc = useTRPC();
	const [autoActiveFragment, setAutoActiveFragment] = useState<Fragment | null>(
		null,
	);
	const [userActiveFragment, setUserActiveFragment] = useState<Fragment | null>(
		null,
	);
	const activeFragment = userActiveFragment ?? autoActiveFragment;

	const [tabState, setTabState] = useState<"preview" | "code">("preview");

	// Workspace panel gating
	const workspacePanelRef = useRef<ImperativePanelHandle>(null);
	const [workspaceManuallyOpened, setWorkspaceManuallyOpened] = useState(false);

	// Artifact version for deep links (when viewing a specific run's output)
	const [deepLinkSandboxUrl, setDeepLinkSandboxUrl] = useState<string | null>(null);

	// Run data
	const projectRuns = useProjectRuns(projectId);
	const runActions = useRunActions(projectId);

	const runContextValue = {
		runs: projectRuns.runs,
		lineages: projectRuns.lineages,
		activeRun: projectRuns.activeRun,
		hasActiveBuild: projectRuns.hasActiveBuild,
		confirm: runActions.confirm,
		cancel: runActions.cancel,
		retry: runActions.retry,
		isActionPending: runActions.isPending,
	};

	const handleUserSelectFragment = (fragment: Fragment | null) => {
		setUserActiveFragment(fragment);
		setDeepLinkSandboxUrl(null);
		if (fragment) {
			setWorkspaceManuallyOpened(true);
		}
	};

	const handleAutoSelectFragment = (fragment: Fragment | null) => {
		setAutoActiveFragment(fragment);
		setUserActiveFragment(null);
		setDeepLinkSandboxUrl(null);
	};

	const handleUserMessageSendStart = () => {
		setAutoActiveFragment(null);
		setUserActiveFragment(null);
		setDeepLinkSandboxUrl(null);
	};

	const handleOpenWorkspace = useCallback(() => {
		setWorkspaceManuallyOpened(true);
		setTabState("preview");
		// Expand workspace panel
		const panel = workspacePanelRef.current;
		if (panel?.isCollapsed()) {
			panel.expand(50);
		}
	}, []);

	const { has, isLoaded } = useAuth();
	const hasProAccess = isLoaded ? has?.({ plan: "pro" }) : undefined;
	const { data: latestArtifactVersion } = useSuspenseQuery(
		trpc.artifacts.getLatest.queryOptions(
			{ projectId },
			{
				refetchInterval: 1500,
			},
		),
	);

	// Determine if workspace should be visible
	const shouldShowWorkspace =
		!!activeFragment ||
		!!deepLinkSandboxUrl ||
		workspaceManuallyOpened ||
		!!latestArtifactVersion;

	// Programmatic workspace panel collapse/expand
	useEffect(() => {
		const panel = workspacePanelRef.current;
		if (!panel) return;

		if (shouldShowWorkspace && panel.isCollapsed()) {
			panel.expand(50);
		} else if (!shouldShowWorkspace && !panel.isCollapsed()) {
			panel.collapse();
		}
	}, [shouldShowWorkspace]);

	return (
		<RunProvider value={runContextValue}>
			<div className="h-screen">
				<ResizablePanelGroup direction="horizontal">
					<ResizablePanel
						defaultSize={shouldShowWorkspace ? 35 : 100}
						minSize={20}
						className="flex flex-col min-h-0"
					>
						<ErrorBoundary fallback={<p>Error loading project</p>}>
							<Suspense fallback={<p>Loading project...</p>}>
								<ProjectHeader projectId={projectId} />
							</Suspense>
						</ErrorBoundary>
						<ErrorBoundary fallback={<p>Error loading messages</p>}>
							<Suspense fallback={<p>Loading messages...</p>}>
								<MessagesContainer
									projectId={projectId}
									activeFragment={activeFragment}
									onUserSelectFragment={handleUserSelectFragment}
									onAutoSelectFragment={handleAutoSelectFragment}
									onUserMessageSendStart={handleUserMessageSendStart}
									onOpenWorkspace={handleOpenWorkspace}
								/>
							</Suspense>
						</ErrorBoundary>
					</ResizablePanel>
					{shouldShowWorkspace && (
						<ResizableHandle className="hover:bg-primary transition-colors" />
					)}
					<ResizablePanel
						ref={workspacePanelRef}
						defaultSize={shouldShowWorkspace ? 65 : 0}
						minSize={30}
						collapsedSize={0}
						collapsible={true}
						className="flex flex-col min-h-0"
						onCollapse={() => setWorkspaceManuallyOpened(false)}
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
								{activeFragment ? (
									<FragmentWeb data={activeFragment} />
								) : deepLinkSandboxUrl ? (
									<SandboxPreview sandboxUrl={deepLinkSandboxUrl} />
								) : latestArtifactVersion?.sandboxUrl ? (
									<SandboxPreview sandboxUrl={latestArtifactVersion.sandboxUrl} />
								) : (
									<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
										No preview available yet.
									</div>
								)}
							</TabsContent>
							<TabsContent value="code" className="min-h-0">
								{latestArtifactVersion ? (
									<FileExplorer
										files={latestArtifactVersion.files}
									/>
								) : (
									<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
										No artifact version available yet.
									</div>
								)}
							</TabsContent>
						</Tabs>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
		</RunProvider>
	);
};
