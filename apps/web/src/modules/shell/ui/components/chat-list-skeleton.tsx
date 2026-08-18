import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton, } from "@/components/ui/sidebar";

const PLACEHOLDER_ROWS = 6;

/**
 * Suspense fallback for the sidebar chat list.
 * @returns {JSX.Element} Placeholder rows sized like real chat entries.
 */
export const ChatListSkeleton = () => {
	return (
		<SidebarGroup>
			<SidebarGroupContent>
				<SidebarMenu>
					{Array.from({ length: PLACEHOLDER_ROWS }).map((_, index) => (
						<SidebarMenuItem key={index}>
							<SidebarMenuSkeleton />
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
};
