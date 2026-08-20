import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";

import { getRunProfile } from "../engine/run-profiles";
import { evaluateMissionProof } from "./evaluate-mission-proof";

const { invokeStructuredModel, requireStructuredAiModelForPurpose } =
  vi.hoisted(() => ({
    invokeStructuredModel: vi.fn(),
    requireStructuredAiModelForPurpose: vi.fn(() => ({ modelId: "test" })),
  }));

vi.mock("../engine/invoke-structured-model", () => ({ invokeStructuredModel }));
vi.mock("../engine/model-router", () => ({
  requireStructuredAiModelForPurpose,
}));

describe("evaluateMissionProof", () => {
  it("uses the critical structured evaluation contract", async () => {
    const draft = {
      executionScore: 30,
      executionFeedback: "The action was completed.",
      evidenceScore: 25,
      evidenceFeedback: "The proof is specific.",
      judgmentScore: 20,
      judgmentFeedback: "The decisions are explained.",
      summary: "Credible execution with one evidence gap.",
      nextStep: "Attach the final artifact.",
    };
    invokeStructuredModel.mockReturnValue({ output: Promise.resolve(draft) });

    await expect(
      Effect.runPromise(
        evaluateMissionProof({
          spec: { title: "Ship it" } as unknown as MissionSpec,
          plan: { steps: ["Do it"] } as unknown as MissionPlan,
          proof: { notes: "Done" } as unknown as MissionProof,
        }),
      ),
    ).resolves.toEqual(draft);

    expect(requireStructuredAiModelForPurpose).toHaveBeenCalledWith(
      "evaluation",
      "Mission evaluation is unavailable.",
    );
    expect(invokeStructuredModel).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: "mission_evaluation",
        maxSteps: getRunProfile("evaluation").maxSteps,
        profile: getRunProfile("evaluation"),
      }),
    );
  });
});
