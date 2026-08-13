import { describe, expect, it } from "vitest";

import { extractFirstJsonObject } from "./invoke-structured-model";

describe("extractFirstJsonObject", () => {
  it("leaves a single JSON object unchanged", () => {
    expect(extractFirstJsonObject('{"answer":"B"}')).toBe('{"answer":"B"}');
  });

  it("removes a prefix, code fence, and trailing text", () => {
    expect(
      extractFirstJsonObject(
        '```json\n{"answer":"B","reason":"supported"}\n```\nDone.',
      ),
    ).toBe('{"answer":"B","reason":"supported"}');
  });

  it("tracks nested objects and ignores braces inside strings", () => {
    const object = String.raw`{"scenario":{"text":"Use {evidence}, then \"decide}\".","key":{"answer":"B"}}}`;

    expect(extractFirstJsonObject(`Result:\n${object}\nextra`)).toBe(object);
  });

  it("keeps an incomplete root available to partial parsing", () => {
    expect(extractFirstJsonObject('```json\n{"answer":"B')).toBe(
      '{"answer":"B',
    );
  });

  it("leaves output without an object unchanged for error reporting", () => {
    expect(extractFirstJsonObject("not json")).toBe("not json");
  });
});
