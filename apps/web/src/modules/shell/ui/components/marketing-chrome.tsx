import { Navbar } from "@/modules/home/ui/components/navbar";

interface Props {
	children: React.ReactNode;
}

/**
 * Signed-out chrome: the top navbar over a dotted background. Used by the
 * marketing route group and by the app layout when nobody is signed in, so `/`
 * can render either shell at the same URL.
 * @param {Props} props - The chrome props.
 * @returns {JSX.Element} The rendered marketing shell.
 */
export const MarketingChrome = ({ children }: Props) => {
	return (
		<main className="flex flex-col min-h-screen max-h-screen">
			<Navbar />
			<div
				className="absolute inset-0 -z-10 h-full w-full bg-background
            dark:bg-[radial-gradient(#393e4a_1px,transparent_1px)] bg-[radial-gradient(#dadde2_1px,transparent_1px)] [background-size:16px_16px]"
			/>
			<div className="flex-1 flex flex-col px-4 pb-4 overflow-y-auto">
				{children}
			</div>
		</main>
	);
};
