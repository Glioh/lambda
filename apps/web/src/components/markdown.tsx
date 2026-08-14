"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

interface MarkdownProps {
	content: string;
	className?: string;
}

/**
 * Converts LaTeX \(...\) and \[...\] delimiters into the $...$/$$...$$ form
 * that remark-math understands. OpenAI models emit the backslash form by
 * default (ChatGPT's UI performs this same normalization). Code fences and
 * inline code spans are left untouched so code examples aren't corrupted.
 */
function normalizeMathDelimiters(content: string): string {
	// Split out fenced code blocks and inline code; only transform prose parts.
	const segments = content.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);

	return segments
		.map((segment, index) => {
			const isCode = index % 2 === 1;
			if (isCode) {
				return segment;
			}

			return segment
				.replace(/\\\[([\s\S]*?)\\\]/g, (_match, expr) => `\n$$\n${expr}\n$$\n`)
				.replace(/\\\(([\s\S]*?)\\\)/g, (_match, expr) => `$${expr}$`);
		})
		.join("");
}

/**
 * Renders assistant message text as GitHub-flavored Markdown with LaTeX math.
 * - remark-gfm: tables, strikethrough, task lists, autolinks
 * - remark-math + rehype-katex: `$inline$` and `$$block$$` math via KaTeX
 * Styling lives in the `.markdown` block in globals.css (no typography plugin needed).
 */
export function Markdown({ content, className }: MarkdownProps) {
	return (
		<div className={cn("markdown", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeKatex]}
				components={{
					// Open links in a new tab; they come from model output.
					a: ({ ...props }) => (
						<a {...props} target="_blank" rel="noopener noreferrer" />
					),
				}}
			>
				{normalizeMathDelimiters(content)}
			</ReactMarkdown>
		</div>
	);
}
