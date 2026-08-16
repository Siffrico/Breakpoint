import { afterEach, describe, expect, it, vi } from "vitest";

import { getAiModelForTier, withAiModelPreference } from "./model-router";

const { createOpenRouterModel } = vi.hoisted(() => ({
  createOpenRouterModel: vi.fn(() => ({ specificationVersion: "v2" })),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => createOpenRouterModel),
}));

describe("model router", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("routes DeepSeek V4 Pro 0813 through its OpenRouter model id", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");

    const model = await withAiModelPreference("deepseek-v4-pro-0813", () =>
      Promise.resolve(getAiModelForTier("critical")),
    );

    expect(model).not.toBeNull();
    expect(createOpenRouterModel).toHaveBeenCalledWith(
      "deepseek/deepseek-v4-pro-0813",
    );
  });
});
