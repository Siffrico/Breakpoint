// education-unit/orchestrate-unit-turn.ts
//
// The unit turn engine — the ONLY module outside fsm.ts that applies a
// transition. It picks the phase agent for the current phase, runs its single
// model call, maps the emitted grading tool call into a UnitEvent, applies
// fsm.transition(), and reports what the persistence layer needs to commit.
//
// It is pure over its inputs except for the one model call (run through the
// phase agent's own typed retry). No DB, no Goldilocks, no HTTP — the caller
// (workspace-turn-orchestration) owns all of that.

import type { ModelMessage } from "ai";
import { Effect } from "effect";

import { runConnectAgent } from "./agents/connect-agent";
import { runOrientAgent } from "./agents/orient-agent";
import { runSolveAgent } from "./agents/solve-agent";
import { runTeachAgent } from "./agents/teach-agent";
import type { PhaseAgentError } from "./agents/errors";
import type { PhaseAgentResult } from "./agents/run-phase-agent";
import type { PhaseAgentOutput } from "./agents/output-schema";
import { transition, writesGoldilocks } from "./fsm";
import type { UnitEvent, UnitRecipe, UnitState } from "./unit";
import {
  GradeSolutionInputSchema,
  toUnitEvent,
} from "../workspace-ai/fsm-tools";

// A turn that cannot be interpreted — the graded phase agent returned no
// grading tool call, or the args it sent don't validate. This is surfaced to
// the caller (which fails the turn cleanly) rather than guessing a verdict.
export class EducationUnitTurnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EducationUnitTurnError";
  }
}

export interface UnitTurnInput {
  /** The durable cursor BEFORE this turn. */
  state: UnitState;
  recipe: UnitRecipe;
  /** The "## Context" block from buildUnitTurnContext. */
  contextBlock: string;
  /** Prior conversation for this unit, oldest first. */
  transcript: readonly ModelMessage[];
}

export interface UnitTurnResult {
  /** The learner-facing reply to persist and stream. */
  assistantMessage: string;
  /** The event the tool call (or an auto teach_done) mapped to. */
  event: UnitEvent;
  /** The durable cursor AFTER applying the event. */
  nextState: UnitState;
  /**
   * True when this Connect failure exhausted the grill budget and the learner
   * was force-advanced to Solve. The caller must persist this so the next
   * Solve turn's context knows to teach the missed idea (the connectGrills
   * counter is gone after the transition — see fsm.ts).
   */
  forcedConnectAdvance: boolean;
  /** The grader's one-sentence reasoning, for persistence metadata. */
  gradeReasoning: string | null;
  /**
   * Present only on a passing pass-2 solve (writesGoldilocks). The score to
   * feed the rating system; null on every other turn.
   */
  ratingWrite: { score: number } | null;
}

const runPhaseForState = (
  state: UnitState,
  messages: ModelMessage[],
): Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError> => {
  switch (state.phase) {
    case "orient":
      return runOrientAgent(messages);
    case "connect":
      return runConnectAgent(messages);
    case "solve":
      return runSolveAgent(messages);
    case "teach":
      return runTeachAgent(messages);
    case "mastered":
      return Effect.die(
        new EducationUnitTurnError(
          "Unit is already mastered; no turn to run.",
        ),
      );
  }
};

const GRADING_TOOL_BY_PHASE: Partial<Record<UnitState["phase"], string>> = {
  connect: "gradeConnection",
  solve: "gradeSolution",
};

/**
 * Reads the single grading tool call the connect/solve agents emit and maps it
 * to a UnitEvent. orient/teach never grade — they auto-fire teach_done.
 */
const resolveEvent = (
  state: UnitState,
  result: PhaseAgentResult<PhaseAgentOutput>,
): { event: UnitEvent; reasoning: string | null } => {
  if (state.phase === "orient" || state.phase === "teach") {
    return { event: { type: "teach_done" }, reasoning: null };
  }

  const expectedTool = GRADING_TOOL_BY_PHASE[state.phase];
  const call = result.toolCalls.find((c) => c.toolName === expectedTool);
  if (!call) {
    throw new EducationUnitTurnError(
      `The ${state.phase} agent did not return a verdict (${expectedTool} was not called).`,
    );
  }

  const event = toUnitEvent(call.toolName, call.input);
  if (!event) {
    throw new EducationUnitTurnError(
      `The ${state.phase} agent called ${call.toolName} with invalid arguments.`,
    );
  }

  const input = call.input;
  const reasoning =
    typeof input === "object" &&
    input !== null &&
    "reasoning" in input &&
    typeof input.reasoning === "string"
      ? input.reasoning
      : null;

  return { event, reasoning };
};

const readSolveScore = (
  result: PhaseAgentResult<PhaseAgentOutput>,
): number | null => {
  const call = result.toolCalls.find((c) => c.toolName === "gradeSolution");
  if (!call) return null;
  const parsed = GradeSolutionInputSchema.safeParse(call.input);
  return parsed.success ? parsed.data.score : null;
};

/**
 * Runs one unit turn end to end (model call -> event -> transition) and
 * returns everything the caller must persist. Rejects with
 * EducationUnitTurnError when a graded phase produced no usable verdict, and
 * with the phase agent's own tagged error when the model call itself failed.
 */
export const runUnitTurn = async (
  input: UnitTurnInput,
): Promise<UnitTurnResult> => {
  const { state, recipe, contextBlock, transcript } = input;

  const messages: ModelMessage[] = [
    { role: "user", content: contextBlock },
    ...transcript,
  ];

  const result = await Effect.runPromise(runPhaseForState(state, messages));
  const { event, reasoning } = resolveEvent(state, result);

  // Capture the force-advance signal BEFORE transition wipes connectGrills.
  const forcedConnectAdvance =
    state.phase === "connect" &&
    event.type === "connection_graded" &&
    !event.connected &&
    state.connectGrills + 1 >= recipe.policy.maxGrillsBeforeTeach;

  const nextState = transition(state, event, recipe.policy);

  const ratingWrite = writesGoldilocks(state, event)
    ? { score: readSolveScore(result) ?? recipe.grade.passAt }
    : null;

  return {
    assistantMessage: result.object.assistantMessage,
    event,
    nextState,
    forcedConnectAdvance,
    gradeReasoning: reasoning,
    ratingWrite,
  };
};
