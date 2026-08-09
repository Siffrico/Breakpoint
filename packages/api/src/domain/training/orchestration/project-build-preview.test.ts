import { describe, expect, it } from "vitest";

import { previewProjectBuildArtifact } from "./project-build-preview";

describe("previewProjectBuildArtifact", () => {
  it("renders the confirmed outcomes", () => {
    const detail = previewProjectBuildArtifact({
      step: "curriculum",
      payload: {
        identityReport: {
          targetIdentity: "SAT Math test-taker",
          headline: "Reach the target SAT Math score.",
        },
        outcomes: [
          {
            title: "Algebra",
            result: "Solve SAT Algebra questions accurately.",
          },
          undefined,
        ],
      },
    });

    expect(detail.body).toContain("Target: SAT Math test-taker");
    expect(detail.body).toContain("Outcomes: Algebra");
  });
});
