const FLATTENED_MARKDOWN_BLOCK =
  /(?:^| {2,})(?:#{1,6} |```(?:[A-Za-z0-9_-]+)?(?: |$)|[-*+] |\d+\. )/;

const FENCE_LINE = /^ {0,3}(?:```|~~~)/;
const ATX_HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT_UNDERLINE_LINE = /^ {0,3}(?:=+|-{2,})[ \t]*$/;

/**
 * Assistant turns speak; they do not file reports. A heading in a chat reply is
 * always a label announcing what the next paragraph already says ("Feedback",
 * "The Scenario"), so headings are removed here rather than merely discouraged
 * in the prompt — the model cannot be relied on to hold a formatting rule, and
 * this is the last point before render.
 *
 * Fence-aware: a `#` comment inside a code block is content, not a heading.
 * Prose emphasis, lists, rules and code are untouched.
 */
const stripHeadings = (markdown: string): string => {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let insideFence = false;

  for (const line of lines) {
    if (FENCE_LINE.test(line)) {
      insideFence = !insideFence;
      kept.push(line);
      continue;
    }
    if (insideFence) {
      kept.push(line);
      continue;
    }
    if (ATX_HEADING_LINE.test(line)) continue;
    // A setext underline promotes the line above it to a heading, so both the
    // underline and the line it promotes go. It only counts when there is a
    // non-blank line to promote — a `---` after a blank line is a horizontal
    // rule and stays.
    if (SETEXT_UNDERLINE_LINE.test(line) && kept.at(-1)?.trim()) {
      kept.pop();
      continue;
    }
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export function normalizeAssistantMarkdown(content: string): string {
  const trimmed = content.trim();
  if (trimmed.includes("\n") || !FLATTENED_MARKDOWN_BLOCK.test(trimmed)) {
    return stripHeadings(trimmed);
  }

  return stripHeadings(
    trimmed
      .replace(/```([A-Za-z0-9_-]+) (?=\S)/g, "```$1\n")
      .replace(/ (?=```(?: {2,}|$))/g, "\n")
      .replace(/ {2,}/g, "\n\n")
      .replace(/\n{3,}/g, "\n\n"),
  );
}
