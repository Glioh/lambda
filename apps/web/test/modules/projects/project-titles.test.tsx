import assert from "node:assert/strict";
import { after, before, it, mock } from "node:test";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { getProjectQueryKey, listMessagesQueryKey, listProjectsQueryKey, } from "@lambda/api-client/query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { client } from "../../../../../packages/api-client/src/generated/.kubb/client";

const passthrough = ({ children }: { children?: ReactNode }) =>
	createElement(Fragment, null, children);
const empty = () => null;
let streamEnded: (() => void) | undefined;
mock.module("next/navigation", {
	namedExports: { useRouter: () => ({}), usePathname: () => "/projects/project-1" },
});
mock.module("@/components/user-control", { namedExports: { UserControl: empty } });
mock.module("@/components/ui/sidebar", {
	namedExports: {
		SidebarTrigger: empty,
		SidebarMenuItem: passthrough,
		SidebarMenuButton: passthrough,
		SidebarMenuAction: passthrough,
		useSidebar: () => ({ isMobile: false }),
	},
});
mock.module("@/components/ui/dropdown-menu", {
	namedExports: {
		DropdownMenu: passthrough,
		DropdownMenuContent: passthrough,
		DropdownMenuTrigger: passthrough,
		DropdownMenuItem: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) =>
			createElement("button", { disabled }, children),
	},
});
mock.module("@/modules/shell/ui/components/rename-chat-dialog", {
	namedExports: { RenameChatDialog: empty },
});
mock.module("@/modules/shell/ui/components/delete-chat-dialog", {
	namedExports: { DeleteChatDialog: empty },
});
mock.module("@/modules/projects/ui/components/message-form", {
	namedExports: {
		MessageForm: ({ onChatStreamEnd }: { onChatStreamEnd: () => void }) => {
			streamEnded = onChatStreamEnd;
			return null;
		},
	},
});

let ChatHeader: typeof import("@/modules/projects/ui/components/chat-header").ChatHeader;
let ChatListItem: typeof import("@/modules/shell/ui/components/chat-list-item").ChatListItem;
let MessagesContainer: typeof import("@/modules/projects/ui/components/messages-container").MessagesContainer;
before(async () => {
	({ ChatHeader } = await import("@/modules/projects/ui/components/chat-header"));
	({ ChatListItem } = await import("@/modules/shell/ui/components/chat-list-item"));
	({ MessagesContainer } = await import("@/modules/projects/ui/components/messages-container"));
});
after(() => mock.restoreAll());

const detailKey = getProjectQueryKey({ path: { projectId: "project-1" } });
const listKey = listProjectsQueryKey();
const name = "Can you help me understand binary search trees in Java";

function setup(titleFinalized: boolean) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
			mutations: { retry: false, gcTime: Infinity },
		},
	});
	const project = {
		id: "project-1",
		name,
		titleFinalized,
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	};
	queryClient.setQueryData(detailKey, project);
	queryClient.setQueryData(listKey, [project]);
	queryClient.setQueryData(listMessagesQueryKey({ path: { projectId: project.id } }), []);
	const render = (child: ReactNode) =>
		renderToStaticMarkup(
			<ClerkProvider publishableKey="pk_test_Y2xlcmsuZXhhbXBsZS5jb20k">
				<QueryClientProvider client={queryClient}>{child}</QueryClientProvider>
			</ClerkProvider>,
		);
	return { queryClient, project, render };
}

for (const titleFinalized of [false, true]) {
	it(`header and sidebar preserve the full title and ${titleFinalized ? "enable" : "disable"} rename`, () => {
		const { queryClient, project, render } = setup(titleFinalized);
		try {
			for (const component of [
				createElement(ChatHeader, { projectId: project.id }),
				createElement(ChatListItem, {
					chat: { ...project, updatedAt: new Date(project.updatedAt) },
				}),
			]) {
				const markup = render(component);
				assert.ok(markup.includes(`title="${name}"`));
				assert.ok(markup.includes(`>${name}</span>`));
				assert.match(
					markup,
					titleFinalized
						? /<button><svg[^]*?Rename<\/button>/
						: /<button disabled=""><svg[^]*?Rename<\/button>/,
				);
			}
		} finally {
			queryClient.clear();
		}
	});
}

for (const result of [null, { id: "project-1", name: "Understanding binary search trees" }]) {
	it(`refreshes detail and sidebar after ${result ? "a generated title" : "a null title result"}, even without a mounted observer`, async () => {
		const { queryClient, render } = setup(false);
		const config = client.getConfig();
		client.setConfig({ baseURL: "http://api.test" });
		const fetchMock = mock.method(globalThis, "fetch", async () => Response.json(result));
		try {
			render(createElement(MessagesContainer, { projectId: "project-1" }));
			assert.ok(streamEnded);
			const completed = new Promise<void>((resolve, reject) => {
				const unsubscribe = queryClient.getMutationCache().subscribe(event => {
					if (event.mutation?.state.status === "success") {
						unsubscribe();
						resolve();
					}
					if (event.mutation?.state.status === "error") {
						unsubscribe();
						reject(event.mutation.state.error);
					}
				});
			});
			streamEnded();
			await completed;
			assert.equal(fetchMock.mock.callCount(), 1);
			assert.equal(queryClient.getQueryState(detailKey)?.isInvalidated, true);
			assert.equal(queryClient.getQueryState(listKey)?.isInvalidated, true);
		} finally {
			fetchMock.mock.restore();
			client.setConfig(config);
			queryClient.clear();
		}
	});
}

it("does not request another automatic title for a finalized project", () => {
	const { queryClient, render } = setup(true);
	try {
		render(createElement(MessagesContainer, { projectId: "project-1" }));
		streamEnded?.();
		assert.equal(queryClient.getMutationCache().getAll().length, 0);
	} finally {
		queryClient.clear();
	}
});
