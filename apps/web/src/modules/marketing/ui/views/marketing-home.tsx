import Image from "next/image";
import { ProjectForm } from "@/modules/home/ui/components/project-form";

/**
 * The signed-out landing page: hero copy over the composer. Signed-in users get
 * {@link NewChatView} at this same URL instead.
 * @returns {JSX.Element} The rendered marketing home.
 */
export const MarketingHome = () => {
	return (
		<div className="flex flex-col max-w-5xl mx-auto w-full">
			<section className="space-y-6 py-[16vh] 2xl:py-48">
				<div className="flex flex-col items-center">
					<Image
						src="/logo.svg"
						alt="Lambda logo"
						width={50}
						height={50}
						className="hidden md:block"
					/>
				</div>
				<h1 className="text-2xl md:text-5xl font-bold text-center">Chat with Lambda</h1>
				<p className="text-lg md:text-xl text-muted-foreground text-center">
					Ask questions about UI, React, Next.js, and coding
				</p>
				<div className="max-w-3xl mx-auto w-full">
					<ProjectForm />
				</div>
			</section>
		</div>
	);
};
