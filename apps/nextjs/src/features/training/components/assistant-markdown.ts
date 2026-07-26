const FLATTENED_MARKDOWN_BLOCK =
  /(?:^| {2,})(?:#{1,6} |```(?:[A-Za-z0-9_-]+)?(?: |$)|[-*+] |\d+\. )/;

export function normalizeAssistantMarkdown(content: string): string {
  const trimmed = content.trim();
  if (trimmed.includes("\n") || !FLATTENED_MARKDOWN_BLOCK.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .replace(/```([A-Za-z0-9_-]+) (?=\S)/g, "```$1\n")
    .replace(/ (?=```(?: {2,}|$))/g, "\n")
    .replace(/ {2,}/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n");
}
