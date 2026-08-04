import { describe, expect, it } from "vitest";

import { normalizeAssistantMarkdown } from "./assistant-markdown";

describe("normalizeAssistantMarkdown", () => {
  it("restores block boundaries in a flattened Markdown response", () => {
    const content =
      "## The map  One mechanism.  ### Expert trip  1. Inspect the trace.  2. Verify the result.";

    expect(normalizeAssistantMarkdown(content)).toBe(
      "One mechanism.\n\n1. Inspect the trace.\n\n2. Verify the result.",
    );
  });

  it("moves a flattened fenced body below its language marker", () => {
    const content =
      "## Flow  ```mermaid graph TD  request-->cache ```  Notice the cache lookup.";

    expect(normalizeAssistantMarkdown(content)).toBe(
      "```mermaid\ngraph TD\n\nrequest-->cache\n```\n\nNotice the cache lookup.",
    );
  });

  it("does not rewrite ordinary prose", () => {
    expect(normalizeAssistantMarkdown("Keep  intentional spacing.")).toBe(
      "Keep  intentional spacing.",
    );
  });

  it("removes section-label headings the assistant should not emit", () => {
    expect(normalizeAssistantMarkdown("## Feedback\n\nParagraph.")).toBe(
      "Paragraph.",
    );
    expect(normalizeAssistantMarkdown("The Scenario\n---\n\nParagraph.")).toBe(
      "Paragraph.",
    );
  });

  it("keeps a horizontal rule and code comments that only look like headings", () => {
    expect(normalizeAssistantMarkdown("Above.\n\n---\n\nBelow.")).toBe(
      "Above.\n\n---\n\nBelow.",
    );
    expect(
      normalizeAssistantMarkdown("```bash\n# install deps\npnpm i\n```"),
    ).toBe("```bash\n# install deps\npnpm i\n```");
  });
});
