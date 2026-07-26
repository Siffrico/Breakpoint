import { describe, expect, it } from "vitest";

import { normalizeAssistantMarkdown } from "./assistant-markdown";

describe("normalizeAssistantMarkdown", () => {
  it("restores block boundaries in a flattened Markdown response", () => {
    const content =
      "## The map  One mechanism.  ### Expert trip  1. Inspect the trace.  2. Verify the result.";

    expect(normalizeAssistantMarkdown(content)).toBe(
      "## The map\n\nOne mechanism.\n\n### Expert trip\n\n1. Inspect the trace.\n\n2. Verify the result.",
    );
  });

  it("moves a flattened fenced body below its language marker", () => {
    const content =
      "## Flow  ```mermaid graph TD  request-->cache ```  Notice the cache lookup.";

    expect(normalizeAssistantMarkdown(content)).toBe(
      "## Flow\n\n```mermaid\ngraph TD\n\nrequest-->cache\n```\n\nNotice the cache lookup.",
    );
  });

  it("does not rewrite ordinary prose or already valid Markdown", () => {
    expect(normalizeAssistantMarkdown("Keep  intentional spacing.")).toBe(
      "Keep  intentional spacing.",
    );
    expect(normalizeAssistantMarkdown("## Heading\n\nParagraph.")).toBe(
      "## Heading\n\nParagraph.",
    );
  });
});
