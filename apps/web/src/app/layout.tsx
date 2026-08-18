import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { QueryProvider } from "@/lib/query-provider";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({
	variable: "--font-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Lambda",
	description: "Chat with Lambda — ask about UI, React, Next.js, and coding.",
};

/** Provides authentication, query, theme, font, and toast context for every route. */
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ClerkProvider
			appearance={{
				variables: {
					colorPrimary: "#C96342",
				},
			}}
		>
			<QueryProvider>
				<html lang="en" suppressHydrationWarning>
					<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
						<ThemeProvider
							attribute="class"
							defaultTheme="system"
							enableSystem
							disableTransitionOnChange
						>
							<Toaster />
							{children}
						</ThemeProvider>
					</body>
				</html>
			</QueryProvider>
		</ClerkProvider>
	);
}
