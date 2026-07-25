import { describe, expect, it } from "vitest";

import { SCENARIO_INSTRUCTION } from "./scenario-agent";

describe("scenario presentation contract", () => {
  it("requires readable Markdown without prescribing scenario sections", () => {
    expect(SCENARIO_INSTRUCTION).toContain(
      "Start with one short, vivid # title",
    );
    expect(SCENARIO_INSTRUCTION).toContain("blank line between paragraphs");
    expect(SCENARIO_INSTRUCTION).toContain(
      "shape must follow its own situation",
    );
    expect(SCENARIO_INSTRUCTION).toContain(
      "End with exactly three numbered, scenario-specific questions",
    );
  });
});
