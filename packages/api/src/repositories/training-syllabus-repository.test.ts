import { describe, expect, it } from "vitest";

import { clampSyllabusEntryIds } from "./training-syllabus-repository";

describe("clampSyllabusEntryIds", () => {
  it("accepts only assigned targets and reports duplicates once", () => {
    expect(
      clampSyllabusEntryIds({
        requestedEntryIds: ["target-a", "outside", "target-a", "target-b"],
        targetedEntryIds: ["target-a", "target-b", "untouched"],
      }),
    ).toEqual({
      accepted: ["target-a", "target-b"],
      deferred: ["outside"],
    });
  });
});
