"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ClerkProvider
			appearance={{
				variables: {
					colorPrimary: "#C96342",
				},
			}}
		>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				{children}
				<Toaster />
			</ThemeProvider>
		</ClerkProvider>
	);
}
