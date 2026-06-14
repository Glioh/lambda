import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownContentProps {
	content: string;
}

/**
 * Normalizes LaTeX delimiters so remark-math can parse them. Models emit math
 * with inconsistent delimiters — some use $...$ / $$...$$ (which remark-math
 * understands natively) and others use \(...\) / \[...\] (which it does not).
 * Convert the latter to the former.
 * @param {string} content - Raw assistant content.
 * @returns {string} Content with normalized math delimiters.
 */
const normalizeMathDelimiters = (content: string): string =>
	content
		.replace(/\\\[/g, "$$$$")
		.replace(/\\\]/g, "$$$$")
		.replace(/\\\(/g, "$")
		.replace(/\\\)/g, "$");

/**
 * Renders assistant message content as GitHub-flavored Markdown with LaTeX math
 * support (KaTeX). Models emit markdown (**bold**, lists, `code`) and math
 * ($...$, $$...$$); this turns that into formatted output instead of raw text.
 * @param {MarkdownContentProps} props - The content to render.
 * @returns {JSX.Element} The rendered markdown block.
 */
export const MarkdownContent = ({ content }: MarkdownContentProps) => {
	return (
		<div
			className="prose prose-sm dark:prose-invert max-w-none break-words
			prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none
			prose-code:after:content-none prose-headings:mt-3 prose-headings:mb-1
			prose-p:my-2 prose-ul:my-2 prose-ol:my-2
			[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden
			[&_.katex-display]:py-1"
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeKatex]}
			>
				{normalizeMathDelimiters(content)}
			</ReactMarkdown>
		</div>
	);
};
