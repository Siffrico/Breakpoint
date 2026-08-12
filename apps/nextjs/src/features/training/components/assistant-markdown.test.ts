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

  it("preserves headings that organize learner-facing material", () => {
    expect(
      normalizeAssistantMarkdown(
        "## Worked Example\n\nSolved case.\n\n## Your Task\n\nFresh case.",
      ),
    ).toBe(
      "## Worked Example\n\nSolved case.\n\n## Your Task\n\nFresh case.",
    );
  });

  it("puts complete inline answer choices on separate blocks", () => {
    expect(
      normalizeAssistantMarkdown(
        "Which word fits? A) narrow B) broad C) quiet D) late",
      ),
    ).toBe(
      "Which word fits?\n\nA) narrow\n\nB) broad\n\nC) quiet\n\nD) late",
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
