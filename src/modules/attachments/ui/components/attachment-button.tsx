"use client";

import { useRef } from "react";
import { ImageIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_IMAGE_TYPES } from "../../constants";

interface Props {
	onFiles: (files: FileList | File[]) => void;
	disabled?: boolean;
	isPreparing?: boolean;
}

/**
 * The composer's "attach image" control and its hidden file input.
 * @param {Props} props - The button props.
 * @returns {JSX.Element} The rendered attach control.
 */
export const AttachmentButton = ({ onFiles, disabled, isPreparing }: Props) => {
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept={ACCEPTED_IMAGE_TYPES.join(",")}
				multiple
				className="hidden"
				onChange={(event) => {
					if (event.target.files?.length) {
						onFiles(event.target.files);
					}

					// Reset so picking the same file twice in a row still fires change.
					event.target.value = "";
				}}
			/>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				aria-label="Attach image"
				disabled={disabled || isPreparing}
				onClick={() => inputRef.current?.click()}
				className="size-8 rounded-full text-muted-foreground hover:text-foreground"
			>
				{isPreparing ? (
					<Loader2Icon className="size-4 animate-spin" />
				) : (
					<ImageIcon className="size-4" />
				)}
			</Button>
		</>
	);
};
