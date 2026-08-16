import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

const invokeStructuredModel = vi.hoisted(() => vi.fn());

vi.mock("../engine/invoke-structured-model", () => ({
  invokeStructuredModel,
}));

vi.mock("../engine/model-router", () => ({
  getAiModelMetadataForPurpose: () => ({
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash-0731",
    structuredReasoningEffort: "high",
  }),
  requireStructuredAiModelForPurpose: () => ({}),
}));

const { runUnitAgent } = await import("./run-unit-agent");

describe("runUnitAgent", () => {
  it("does not repeat a failed learner-facing model call", async () => {
    invokeStructuredModel.mockReturnValue({
      partialOutputStream: {
        [Symbol.asyncIterator]: () => ({
          next: () =>
            Promise.reject(
              new DOMException("Provider timed out.", "TimeoutError"),
            ),
        }),
      },
      output: Promise.resolve({ assistantMessage: "unused" }),
      totalUsage: Promise.resolve({
        cachedInputTokens: 0,
        inputTokens: 0,
      }),
    });

    await expect(
      Effect.runPromise(
        runUnitAgent({
          agent: "mentor",
          purpose: "education",
          system: "System",
          messages: [],
          context: "Context",
          schema: z.object({ assistantMessage: z.string() }),
          schemaName: "test_schema",
          maxOutputTokens: 100,
          temperature: 0.2,
          errorMessage: "Failed.",
          reasoning: "low",
        }),
      ),
    ).rejects.toMatchObject({ _tag: "UnitAgentTimeoutError" });

    expect(invokeStructuredModel).toHaveBeenCalledOnce();
    expect(invokeStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        outputMode: "tool",
        reasoning: "high",
        temperature: 0.2,
        maxOutputTokens: 100,
      }),
    );
  });
});
