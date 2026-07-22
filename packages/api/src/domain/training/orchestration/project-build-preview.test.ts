import { describe, expect, it } from "vitest";

import { previewProjectBuildArtifact } from "./project-build-preview";

describe("previewProjectBuildArtifact", () => {
  it("renders a curriculum draft before nested arrays have streamed", () => {
    expect(
      previewProjectBuildArtifact({
        step: "curriculum",
        payload: {
          planDraft: {
            title: "Distributed systems judgment",
            summary: "Practice operational tradeoffs.",
          },
        },
      }),
    ).toEqual({
      title: "Curriculum draft",
      body: [
        "Plan: Distributed systems judgment",
        "Summary: Practice operational tradeoffs.",
      ].join("\n"),
      generated: true,
    });
  });

  it("ignores malformed nested collection entries in partial output", () => {
    expect(
      previewProjectBuildArtifact({
        step: "curriculum",
        payload: {
          planDraft: {
            abilities: [undefined, { title: "Failure diagnosis" }],
          },
        },
      }).body,
    ).toBe("Abilities: Failure diagnosis");
  });
});
