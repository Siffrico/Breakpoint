import { describe, expect, it } from "vitest";

import { getAgentConfig } from "./agent-config";

describe("agent config", () => {
  it("resolves artifact limits from the canonical purpose profile", () => {
    expect(getAgentConfig("curriculumDesigner")).toMatchObject({
      model: "learner-selected (default when unset)",
      modelTier: "critical",
      inputTokenLimit: "default",
      reasoningTokenLimit: 24_576,
      outputTokenLimit: 8_192,
      totalGenerationTokenLimit: 32_768,
      maxSteps: 10,
      search: true,
    });
  });

  it("labels inherited interactive limits as default", () => {
    expect(getAgentConfig("unitMentor")).toMatchObject({
      reasoningTokenLimit: "default",
      outputTokenLimit: "default",
      totalGenerationTokenLimit: "default",
      maxSteps: 1,
      search: "default",
    });
  });
});
