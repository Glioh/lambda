import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
	onClick: () => void;
	className?: string;
}

/**
 * The pill that appears when the user has scrolled away from a live response.
 * @param {Props} props - The button props.
 * @returns {JSX.Element} The rendered scroll-to-bottom button.
 */
export const ScrollToBottomButton = ({ onClick, className }: Props) => {
	return (
		<Button
			type="button"
			size="icon"
			variant="outline"
			aria-label="Scroll to bottom"
			onClick={onClick}
			className={cn(
				"size-8 rounded-full border bg-background shadow-md",
				className,
			)}
		>
			<ArrowDownIcon className="size-4" />
		</Button>
	);
};
