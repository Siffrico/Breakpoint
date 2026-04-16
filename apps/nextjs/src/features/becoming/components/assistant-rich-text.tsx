"use client";

import { createMathPlugin } from "@streamdown/math";
import { Streamdown } from "streamdown";

const mathPlugin = createMathPlugin({
  singleDollarTextMath: true,
});

export function AssistantRichText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return null;
  }

  return (
    <Streamdown
      mode="static"
      plugins={{ math: mathPlugin }}
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
