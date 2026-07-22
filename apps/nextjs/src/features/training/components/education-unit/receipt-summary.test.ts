import { describe, expect, it } from "vitest";

import { countWords, receiptTitle, stripMarkdown } from "./receipt-summary";

describe("stripMarkdown", () => {
  it("flattens headings, emphasis, and lists", () => {
    expect(
      stripMarkdown("## Feedback\n\n**Good** start.\n\n- first\n- second"),
    ).toBe("Feedback Good start. first second");
  });

  it("drops fenced code blocks entirely", () => {
    expect(stripMarkdown("Before\n\n```ts\nconst x = 1;\n```\n\nAfter")).toBe(
      "Before After",
    );
  });

  it("drops an unterminated fence (mid-stream)", () => {
    expect(stripMarkdown("Text\n\n```ts\nconst x = 1;")).toBe("Text");
  });

  it("keeps link text, drops the URL", () => {
    expect(stripMarkdown("See [the docs](https://example.com).")).toBe(
      "See the docs.",
    );
  });

  it("unwraps inline code", () => {
    expect(stripMarkdown("Use `retry()` here")).toBe("Use retry() here");
  });
});

describe("receiptTitle", () => {
  it("takes the first sentence", () => {
    expect(
      receiptTitle("Correct. This is the ack-after-effect gap.", "Exchange"),
    ).toBe("Correct.");
  });

  it("prefers the heading line when the turn starts with one", () => {
    expect(receiptTitle("## Feedback\n\nSolid diagnosis.", "Exchange")).toBe(
      "Feedback Solid diagnosis.",
    );
  });

  it("truncates long sentences on a word boundary with an ellipsis", () => {
    const long = `${"word ".repeat(40)}end.`;
    const title = receiptTitle(long, "Exchange");

    expect(title.length).toBeLessThanOrEqual(73);
    expect(title.endsWith("…")).toBe(true);
    expect(title.includes("  ")).toBe(false);
  });

  it("falls back when the turn has no usable text", () => {
    expect(receiptTitle("", "Exchange 3")).toBe("Exchange 3");
    expect(receiptTitle(null, "Exchange 3")).toBe("Exchange 3");
    expect(receiptTitle("```\ncode only\n```", "Exchange 3")).toBe(
      "Exchange 3",
    );
  });
});

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("one two  three\nfour")).toBe(4);
    expect(countWords("   ")).toBe(0);
    expect(countWords("single")).toBe(1);
  });
});
