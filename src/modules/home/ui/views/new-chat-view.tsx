"use client";

import { useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ProjectForm } from "@/modules/home/ui/components/project-form";

/**
 * Returns the time-of-day greeting shown above the composer.
 * @param {number} hour - Local hour, 0-23.
 * @returns {string} "Good morning" | "Good afternoon" | "Good evening".
 */
const greetingFor = (hour: number): string => {
	if (hour < 12) {
		return "Good morning";
	}

	if (hour < 18) {
		return "Good afternoon";
	}

	return "Good evening";
};

/** How often to re-check whether the greeting should change. */
const HOUR_CHECK_MS = 60_000;

/**
 * Re-checks the local hour periodically so a tab left open past a boundary
 * updates its greeting.
 * @param {() => void} onChange - React's store-changed callback.
 * @returns {() => void} The unsubscribe function.
 */
const subscribeToHourChange = (onChange: () => void): (() => void) => {
	const timer = setInterval(onChange, HOUR_CHECK_MS);
	return () => clearInterval(timer);
};

/**
 * The signed-in home screen: a centered composer that starts a new chat.
 * @returns {JSX.Element} The rendered new-chat view.
 */
export const NewChatView = () => {
	const { user, isLoaded } = useUser();
	// Read the hour from an external store rather than during render: the server
	// and the viewer can be in different timezones, so a render-time getHours()
	// is a hydration mismatch waiting to happen. The server snapshot is a neutral
	// greeting; the client's real hour takes over on hydration.
	const greeting = useSyncExternalStore(
		subscribeToHourChange,
		() => greetingFor(new Date().getHours()),
		() => "Hello",
	);
	const firstName = user?.firstName;

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="flex shrink-0 items-center gap-2 p-2">
				<SidebarTrigger />
			</header>

			<div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
				<div className="mx-auto w-full max-w-3xl px-4 py-8">
					<div className="mb-8 flex flex-col items-center gap-3">
						<Image src="/logo.svg" alt="" width={40} height={40} />
						<h1 className="text-center text-2xl font-semibold md:text-3xl">
							{/* Wait for Clerk before showing a name, so it doesn't pop in. */}
							{isLoaded && firstName ? `${greeting}, ${firstName}` : greeting}
						</h1>
					</div>
					<ProjectForm />
				</div>
			</div>
		</div>
	);
};
