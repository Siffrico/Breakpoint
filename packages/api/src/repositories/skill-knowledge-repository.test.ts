import { describe, expect, it } from "vitest";

import { clampKnowledgeIds } from "./skill-knowledge-repository";

describe("clampKnowledgeIds", () => {
  it("accepts only assigned targets and reports duplicates once", () => {
    expect(
      clampKnowledgeIds({
        requestedKnowledgeIds: ["target-a", "outside", "target-a", "target-b"],
        targetedKnowledgeIds: ["target-a", "target-b", "untouched"],
      }),
    ).toEqual({
      accepted: ["target-a", "target-b"],
      deferred: ["outside"],
    });
  });
});
