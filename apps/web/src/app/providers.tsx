"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "@/app/(app)/query-provider";

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
				<QueryProvider>
					{children}
					<Toaster />
				</QueryProvider>
			</ThemeProvider>
		</ClerkProvider>
	);
}
