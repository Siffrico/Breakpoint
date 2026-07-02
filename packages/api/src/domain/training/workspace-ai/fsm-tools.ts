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

export const GradeSolutionInputSchema = z.object({
  passed: z
    .boolean()
    .describe("True only if the solution is correct AND clearly explained."),
  score: z.number().min(0).max(100),
  reasoning: z
    .string()
    .min(1)
    .describe("One sentence: what made this a pass or a fail."),
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
 * for a tool name it doesn't recognize (the caller decides how to treat a
 * missing/unexpected signal — this function never guesses).
 */
export const toUnitEvent = (
  toolName: string,
  args: unknown,
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
      return parsed.success
        ? { type: "solution_graded", passed: parsed.data.passed }
        : null;
    }
    default:
      return null;
  }
};
