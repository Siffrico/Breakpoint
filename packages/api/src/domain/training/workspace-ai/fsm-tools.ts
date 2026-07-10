// workspace-ai/fsm-tools.ts
//
// AI SDK tools are event emitters only. A tool here validates and
// acknowledges a model-emitted signal — it never imports the FSM, calls
// transition(), writes UnitState, or returns next state (enforced by the
// no-restricted-imports rule scoped to *-tools.ts/*-agent.ts files in
// eslint.config.ts). The turn orchestrator is the only layer allowed to map
// a validated tool call into a UnitEvent and apply fsm.transition().

import { tool } from "ai";
import { z } from "zod/v4";

import type { UnitEvent } from "../education-unit/unit";
import { ScenarioSpecSchema } from "../education-unit/scenario-spec";
import { ERROR_CLASSIFICATION_CODES } from "../prompts/shared-instructions";

export const GradeConnectionInputSchema = z.object({
  connected: z
    .boolean()
    .describe(
      "True only if the learner has reconstructed the core connection themselves — not if you just explained it to them.",
    ),
  reasoning: z
    .string()
    .min(1)
    .describe(
      "One sentence: what the learner said or missed, in your own words.",
    ),
});

// The model reports a score; it never declares pass/fail. The verdict is
// derived in toUnitEvent from the recipe's pass bar (recipe.grade.passAt), so
// mastery and the Goldilocks rating always agree on one number. The
// score-vs-errorCodes coherence check also lives there — the bar is runtime
// recipe data this static schema cannot see.
export const GradeSolutionInputSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "0-100. The server derives the pass/fail verdict from this score against the unit's pass bar.",
    ),
  reasoning: z
    .string()
    .min(1)
    .describe("One sentence: what the score rewards or penalizes."),
  errorCodes: z
    .array(z.enum(ERROR_CLASSIFICATION_CODES))
    .max(1)
    .optional()
    .describe(
      "On a score below the pass bar: the primary ERROR_CLASSIFICATION code. Omit at or above the bar.",
    ),
});

export const ContinuePhaseInputSchema = z.object({
  reason: z
    .enum(["prompted", "needs_more_work"])
    .describe(
      "Use prompted when presenting the task; use needs_more_work when asking the learner to continue or revise without recording a failed verdict.",
    ),
});

/** Every tool's execute() returns exactly this — never state, never an event. */
export interface ToolAcknowledgment {
  readonly acknowledged: true;
}

const acknowledge = (): Promise<ToolAcknowledgment> =>
  Promise.resolve({ acknowledged: true });

/** Available only when the current phase is "connect". */
export const gradeConnection = tool({
  description:
    "Call this once you can judge whether the learner has reconstructed the core connection themselves. Do not call it while still probing — only when you have a verdict.",
  inputSchema: GradeConnectionInputSchema,
  execute: acknowledge,
});

/** Available only when the current phase is "solve". */
export const gradeSolution = tool({
  description:
    "Call this once you can judge whether the learner's solution passes. Do not call it while still reviewing — only when you have a verdict.",
  inputSchema: GradeSolutionInputSchema,
  execute: acknowledge,
});

/**
 * Available in Connect when the scenario is first posed, and in Teach when the
 * scenario evolves for the next round. NOT an FSM event — it records the
 * backwards-authored ScenarioSpec artifact (state A/B, chasm, friction,
 * canonical answer, reasoning path, rubric) so teach and the evaluator can
 * reuse it. The orchestrator reads it out of the tool calls (like the solve
 * score), never through toUnitEvent.
 *
 * The tool REQUIRES the world-state fields the persisted record keeps optional
 * (pre-v2 rows lack them): requiring them here is what forces backwards
 * authoring — a model that cannot state the chasm has no scenario.
 */
export const recordScenarioSpec = tool({
  description:
    "Call this exactly once, on the turn you pose or evolve the scenario, to record the spec you authored backwards: target skill, surface (the world), state A (current reality), state B (desired outcome), the chasm (the causal claim tested), friction & noise, the canonical answer, the reasoning path, and the grading rubric.",
  inputSchema: ScenarioSpecSchema.required({
    stateA: true,
    stateB: true,
    chasm: true,
    frictionNoise: true,
  }),
  execute: acknowledge,
});

/** Available in Connect/Solve when the phase needs another learner response. */
export const continuePhase = tool({
  description:
    "Call this when your response asks the learner to answer, clarify, or revise and you are not recording a graded verdict this turn.",
  inputSchema: ContinuePhaseInputSchema,
  execute: acknowledge,
});

export type GradeConnectionInput = z.infer<typeof GradeConnectionInputSchema>;
export type GradeSolutionInput = z.infer<typeof GradeSolutionInputSchema>;
export type ContinuePhaseInput = z.infer<typeof ContinuePhaseInputSchema>;

/**
 * The one place a tool call's validated args become a UnitEvent. Returns null
 * for a tool name it doesn't recognize or arguments that violate the grading
 * contract (the caller decides how to treat a missing/unexpected signal —
 * this function never guesses). `grade` is the recipe's pass bar: the solve
 * verdict is derived here, from the score, never taken from the model.
 */
export const toUnitEvent = (
  toolName: string,
  args: unknown,
  grade: { passAt: number },
): UnitEvent | null => {
  switch (toolName) {
    case "continuePhase": {
      const parsed = ContinuePhaseInputSchema.safeParse(args);
      return parsed.success
        ? { type: "phase_continues", reason: parsed.data.reason }
        : null;
    }
    case "gradeConnection": {
      const parsed = GradeConnectionInputSchema.safeParse(args);
      return parsed.success
        ? { type: "connection_graded", connected: parsed.data.connected }
        : null;
    }
    case "gradeSolution": {
      const parsed = GradeSolutionInputSchema.safeParse(args);
      if (!parsed.success) return null;
      const passed = parsed.data.score >= grade.passAt;
      const errorCodes = parsed.data.errorCodes ?? [];
      // A failing score needs exactly one primary error code (it feeds the
      // rating evidence); a passing score must not carry any.
      if (passed ? errorCodes.length !== 0 : errorCodes.length !== 1) {
        return null;
      }
      return {
        type: "solution_graded",
        passed,
        score: parsed.data.score,
        errorCodes,
      };
    }
    default:
      return null;
  }
};
