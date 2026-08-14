import Link from "next/link";
import { MessageSquareOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Shown when a chat id doesn't exist or belongs to someone else.
 *
 * Rendered inside the app shell, so the sidebar stays put and the user can pick
 * another chat rather than hitting a dead end.
 * @returns {JSX.Element} The rendered not-found view.
 */
const NotFound = () => {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex shrink-0 items-center gap-2 border-b p-2">
				<SidebarTrigger />
			</header>

			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
				<MessageSquareOffIcon className="size-8 text-muted-foreground" />
				<div className="space-y-1">
					<h1 className="text-lg font-semibold">Chat not found</h1>
					<p className="text-sm text-muted-foreground">
						This chat doesn&apos;t exist, or it isn&apos;t yours.
					</p>
				</div>
				<Button asChild size="sm">
					<Link href="/">Start a new chat</Link>
				</Button>
			</div>
		</div>
	);
};

export default NotFound;
