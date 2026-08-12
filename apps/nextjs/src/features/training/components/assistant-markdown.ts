const FLATTENED_MARKDOWN_BLOCK =
  /(?:^| {2,})(?:#{1,6} |```(?:[A-Za-z0-9_-]+)?(?: |$)|[-*+] |\d+\. )/;

const FENCE_LINE = /^ {0,3}(?:```|~~~)/;
const ATX_HEADING_LINE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT_UNDERLINE_LINE = /^ {0,3}(?:=+|-{2,})[ \t]*$/;
const CHAT_META_HEADING = /^(?:feedback|response|the scenario|scenario)$/i;
const OPTION_LABEL =
  /(?:^|\s)(?:\*\*)?\(?([A-D])(?:\)|[.:])(?:\*\*)?[ \t]+\S/gim;
const OPTION_BOUNDARY =
  /[ \t\n]+(?=(?:\*\*)?\(?[A-D](?:\)|[.:])(?:\*\*)?[ \t]+\S)/g;
const TEACHING_SECTION_LABEL =
  /(?:^|[ \t]*)\*\*(Heuristic|Worked example|What held|Change|Use next time)\*\*[ \t]*/gim;
const TEACHING_STEP_LABEL =
  /(?:^|[ \t]*)\*\*(Read|Predict|Compare|Decide)\*\*[ \t]*(?:—|-|:)?[ \t]*/gim;

const headingText = (line: string): string =>
  line
    .replace(/^ {0,3}#{1,6}[ \t]*/, "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();

const organizeSelectedResponseOptions = (markdown: string): string => {
  const labels = new Set(
    [...markdown.matchAll(OPTION_LABEL)].map((match) =>
      match[1]?.toUpperCase(),
    ),
  );
  return labels.size === 4
    ? markdown.replace(OPTION_BOUNDARY, "\n\n")
    : markdown;
};

/**
 * Generic report labels add noise to a conversational reply, but task headings
 * such as "Worked Example", "Passage", and "Your Task" carry real structure.
 * Remove only the known meta labels and preserve the learner-facing hierarchy.
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
    if (ATX_HEADING_LINE.test(line)) {
      if (CHAT_META_HEADING.test(headingText(line))) continue;
      kept.push(line);
      continue;
    }
    // A setext underline promotes the line above it to a heading, so both the
    // underline and the line it promotes go. It only counts when there is a
    // non-blank line to promote — a `---` after a blank line is a horizontal
    // rule and stays.
    if (
      SETEXT_UNDERLINE_LINE.test(line) &&
      CHAT_META_HEADING.test(kept.at(-1)?.trim() ?? "")
    ) {
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
  const trimmed = content
    .replace(
      TEACHING_SECTION_LABEL,
      (_match, label: string) => `\n\n## ${label}\n\n`,
    )
    .replace(
      TEACHING_STEP_LABEL,
      (_match, label: string) => `\n\n### ${label}\n\n`,
    )
    .trim();
  const blockMarkdown =
    trimmed.includes("\n") || !FLATTENED_MARKDOWN_BLOCK.test(trimmed)
      ? trimmed
      : trimmed
          .replace(/```([A-Za-z0-9_-]+) (?=\S)/g, "```$1\n")
          .replace(/ (?=```(?: {2,}|$))/g, "\n")
          .replace(/ {2,}/g, "\n\n")
          .replace(/\n{3,}/g, "\n\n");

  return stripHeadings(organizeSelectedResponseOptions(blockMarkdown));
}
