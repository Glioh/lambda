"use client";

import Link from "next/link";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { ChevronsUpDownIcon, CrownIcon, LogOutIcon, SettingsIcon, SunMoonIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/**
 * Derives up to two initials for the avatar fallback.
 * @param {string | null | undefined} name - The user's display name.
 * @param {string | undefined} email - The user's email, used when there's no name.
 * @returns {string} One or two uppercase initials.
 */
const initialsFor = (name: string | null | undefined, email: string | undefined): string => {
	const source = name?.trim() || email?.split("@")[0] || "";
	const parts = source.split(/[\s._-]+/).filter(Boolean);

	if (parts.length === 0) {
		return "?";
	}

	return parts
		.slice(0, 2)
		.map(part => part[0]?.toUpperCase() ?? "")
		.join("");
};

/**
 * The sidebar footer account menu: plan upgrade, settings, appearance, log out.
 * @returns {JSX.Element} The rendered account menu.
 */
export const SidebarUserMenu = () => {
	const { user, isLoaded } = useUser();
	const { has } = useAuth();
	const { signOut, openUserProfile } = useClerk();
	const { theme, setTheme } = useTheme();

	const email = user?.primaryEmailAddress?.emailAddress;
	const displayName = user?.fullName ?? email?.split("@")[0] ?? "Account";
	const hasProAccess = has?.({ plan: "pro" });

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
							<Avatar className="size-7 rounded-md">
								<AvatarImage src={user?.imageUrl} alt="" />
								<AvatarFallback className="rounded-md text-xs">
									{initialsFor(user?.fullName, email)}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left leading-tight">
								<span className="truncate text-sm font-medium">{isLoaded ? displayName : "…"}</span>
								<span className="truncate text-xs text-muted-foreground">
									{hasProAccess ? "Pro plan" : "Free plan"}
								</span>
							</div>
							<ChevronsUpDownIcon className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>

					<DropdownMenuContent
						side="top"
						align="start"
						sideOffset={8}
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
					>
						{email && (
							<>
								<DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
									{email}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
							</>
						)}

						{isLoaded && !hasProAccess && (
							<DropdownMenuItem asChild>
								<Link href="/pricing">
									<CrownIcon />
									Upgrade plan
								</Link>
							</DropdownMenuItem>
						)}

						<DropdownMenuItem onSelect={() => openUserProfile()}>
							<SettingsIcon />
							Settings
						</DropdownMenuItem>

						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="gap-2">
								<SunMoonIcon className="size-4 text-muted-foreground" />
								<span>Appearance</span>
							</DropdownMenuSubTrigger>
							<DropdownMenuPortal>
								<DropdownMenuSubContent>
									<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
										<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuSubContent>
							</DropdownMenuPortal>
						</DropdownMenuSub>

						<DropdownMenuSeparator />

						{/* useClerk().signOut rather than <SignOutButton>: the latter renders
						    its own button, which would nest inside the menu item's button. */}
						<DropdownMenuItem onSelect={() => signOut({ redirectUrl: "/" })}>
							<LogOutIcon />
							Log out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
};
