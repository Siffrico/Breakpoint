"use client";

import { createMathPlugin } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";

import { normalizeAssistantMarkdown } from "./assistant-markdown";

const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
});

// Renders ```mermaid fences the assistant emits (flows, architecture, sequence
// diagrams) as SVG. Client-only: mermaid.js is dynamically imported on first
// diagram, and a fence only paints once its closing ``` streams in.
const mermaidPlugin = createMermaidPlugin({
  config: { theme: "dark", fontFamily: "inherit" },
});

const RICH_TEXT_PATTERN = /[$*_`#[\]()>|-]|\n|\d+\.\s/;

export function AssistantRichText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const trimmedContent = normalizeAssistantMarkdown(content);

  if (!trimmedContent) {
    return null;
  }

  if (!RICH_TEXT_PATTERN.test(trimmedContent)) {
    return <span className={className}>{trimmedContent}</span>;
  }

  return (
    <Streamdown
      mode="static"
      plugins={{ math: mathPlugin, mermaid: mermaidPlugin }}
      mermaid={{
        errorComponent: ({ error }) => (
          <pre className="text-foreground/48 overflow-x-auto text-[13px]">
            {`Diagram could not render: ${error}`}
          </pre>
        ),
      }}
      controls={{ mermaid: { copy: true, fullscreen: true, download: false } }}
      className={[
        "bp-ai-rich text-inherit [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_ol]:my-0 [&_p]:my-0 [&_pre]:overflow-x-auto [&_ul]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {trimmedContent}
    </Streamdown>
  );
}
