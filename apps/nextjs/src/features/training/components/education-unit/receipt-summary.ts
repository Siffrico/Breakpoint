/**
 * Derives the one-line title a collapsed exchange receipt shows for an
 * assistant turn. Client-side derivation for now; when the server attaches a
 * curated receipt string to message metadata this becomes a passthrough.
 */

const TITLE_MAX_CHARS = 72;

/** Flattens markdown to plain text, dropping fenced code blocks entirely. */
export const stripMarkdown = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Truncates on a word boundary, appending an ellipsis when cut. */
const truncateAtWord = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > maxChars / 2 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
};

/**
 * First sentence (or line) of the assistant turn, markdown-stripped and
 * truncated. Falls back when the turn has no usable text (e.g. a turn that
 * streamed only status parts).
 */
export const receiptTitle = (
  assistantText: string | null | undefined,
  fallback: string,
): string => {
  const plain = assistantText ? stripMarkdown(assistantText) : "";
  if (!plain) return fallback;

  const sentenceEnd = plain.search(/[.!?](\s|$)/);
  const sentence =
    sentenceEnd > 0 ? plain.slice(0, sentenceEnd + 1) : plain;

  return truncateAtWord(sentence, TITLE_MAX_CHARS);
};

export const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;
