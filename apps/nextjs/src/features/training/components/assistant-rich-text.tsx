"use client";

import { useMemo, useState } from "react";
import { createCodePlugin } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import { createAnimatePlugin, Streamdown } from "streamdown";

import { assistantCodeThemes } from "./assistant-code-theme";
import { normalizeAssistantMarkdown } from "./assistant-markdown";

const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
});

// Shiki highlighting is opt-in: without this plugin Streamdown renders fences
// as unstyled monospace. Themes are CSS-variable based — see assistant-code-theme.
const codePlugin = createCodePlugin({ themes: assistantCodeThemes });

// Renders ```mermaid fences the assistant emits (flows, architecture, sequence
// diagrams) as SVG. Client-only: mermaid.js is dynamically imported on first
// diagram, and a fence only paints once its closing ``` streams in.
const mermaidPlugin = createMermaidPlugin({
  config: { theme: "dark", fontFamily: "inherit" },
});

const RICH_TEXT_PATTERN = /[$*_`#[\]()>|-]|\n|\d+\.\s/;

// "Focus" reveal: each newly-arrived word fades up out of a soft blur. The work
// happens in rehype (one span per new word, tagged with CSS variables) and the
// motion itself is a plain CSS keyframe — no per-frame JS, no layout thrash, and
// words already on screen are stamped duration=0 so they never re-animate.
// See `sd-focus` / [data-sd-animate] in app/styles.css.
const ANIMATE_OPTIONS = {
  animation: "focus",
  duration: 280,
  easing: "cubic-bezier(.22,1,.36,1)",
  sep: "word",
  stagger: 18,
} as const;

export function AssistantRichText({
  content,
  className,
  streaming = false,
}: {
  content: string;
  className?: string;
  /** Live turn: reveal incoming words with the focus animation. */
  streaming?: boolean;
}) {
  const trimmedContent = normalizeAssistantMarkdown(content);

  // The animate plugin carries per-message cursor state (how many characters
  // were already visible), so every message needs its own instance.
  const plugins = useMemo(
    () => ({
      animate: createAnimatePlugin(ANIMATE_OPTIONS),
      code: codePlugin,
      math: mathPlugin,
      mermaid: mermaidPlugin,
    }),
    [],
  );

  // Streaming and static mode build different trees; flipping between them at
  // turn end would reparse the message and re-run Shiki. Once a message has
  // streamed it stays in streaming mode — with nothing arriving, that costs
  // nothing — and only `animated` turns off.
  const [streamingMode, setStreamingMode] = useState(streaming);
  if (streaming && !streamingMode) {
    setStreamingMode(true);
  }

  if (!trimmedContent) {
    return null;
  }

  if (!streamingMode && !RICH_TEXT_PATTERN.test(trimmedContent)) {
    return <span className={className}>{trimmedContent}</span>;
  }

  return (
    <Streamdown
      mode={streamingMode ? "streaming" : "static"}
      animated={streaming}
      plugins={plugins}
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
