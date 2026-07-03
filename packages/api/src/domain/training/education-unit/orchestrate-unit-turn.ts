// education-unit/orchestrate-unit-turn.ts
//
// The unit turn engine — the ONLY module outside fsm.ts that applies a
// transition. It picks the phase agent for the current phase, runs its single
// model call, maps the emitted phase-event tool call into a UnitEvent, applies
// fsm.transition(), and reports what the persistence layer needs to commit.
//
// It is pure over its inputs except for the one model call (run through the
// phase agent's own typed retry). No DB, no Goldilocks, no HTTP — the caller
// (workspace-turn-orchestration) owns all of that.

import type { ModelMessage } from "ai";
import { Data, Effect } from "effect";

import type { PhaseAgentError } from "./agents/errors";
import type { PhaseAgentOutput } from "./agents/output-schema";
import type { PhaseAgentResult } from "./agents/run-phase-agent";
import type { ScenarioSpec } from "./scenario-spec";
import type { UnitEvent, UnitRecipe, UnitState } from "./unit";
import {
  GradeSolutionInputSchema,
  toUnitEvent,
} from "../workspace-ai/fsm-tools";
import { ScenarioSpecSchema } from "./scenario-spec";
import { CheckOffSyllabusInputSchema } from "./agents/check-off-syllabus.tool";
import { runConnectAgent } from "./agents/connect-agent";
import { runEvalAgent } from "./agents/eval-agent";
import { runOrientAgent } from "./agents/orient-agent";
import { PhaseAgentOutputSchema } from "./agents/output-schema";
import { runSolveAgent } from "./agents/solve-agent";
import { runTeachAgent } from "./agents/teach-agent";
import { transition, writesGoldilocks } from "./fsm";

// A turn that cannot be interpreted because its output violates the current
// phase contract. This is surfaced rather than guessing a learner outcome.
export class EducationUnitContractError extends Data.TaggedError(
  "EducationUnitContractError",
)<{
  readonly message: string;
}> {}

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
   * Present on a scored pass-2 solve. The persistence boundary applies the
   * exactly-once guard before feeding this score to Goldilocks.
   */
  ratingWrite: { score: number; errorCodes: readonly string[] } | null;
  syllabusCheckOff: { entryIds: string[]; evidence: string } | null;
  /**
   * The ScenarioSpec the connect agent reverse-engineered when it posed the
   * scenario. Null on every turn that doesn't record one — persistence
   * coalesces null onto the stored spec, so it is preserved, not wiped.
   */
  scenarioSpec: ScenarioSpec | null;
}

export type UnitPhaseRunner = (
  state: UnitState,
  messages: ModelMessage[],
) => Effect.Effect<PhaseAgentResult<PhaseAgentOutput>, PhaseAgentError>;

export interface UnitTurnDependencies {
  readonly runPhase: UnitPhaseRunner;
}

const runPhaseForState: UnitPhaseRunner = (
  state: UnitState,
  messages: ModelMessage[],
) => {
  switch (state.phase) {
    case "orient":
      return runOrientAgent(messages);
    case "connect":
      return runConnectAgent(messages);
    case "solve":
      // Pass 1's Solve is graded inline by the scenario/solve agent (formative,
      // no rating). Pass 2 — the transfer pass — is the only scored moment, so
      // it is handed to the dedicated eval agent, whose gradeSolution score is
      // the one Goldilocks consumes (see writesGoldilocks / ratingWrite).
      return state.pass === 2 ? runEvalAgent(messages) : runSolveAgent(messages);
    case "teach":
      return runTeachAgent(messages);
    case "mastered":
      return Effect.die(
        new EducationUnitContractError({
          message: "Unit is already mastered; no turn to run.",
        }),
      );
  }
};

const LIVE_DEPENDENCIES: UnitTurnDependencies = {
  runPhase: runPhaseForState,
};

const EVENT_TOOLS_BY_PHASE: Partial<
  Record<UnitState["phase"], readonly string[]>
> = {
  connect: ["continuePhase", "gradeConnection"],
  solve: ["continuePhase", "gradeSolution"],
};

/**
 * Takes one validated phase-agent result, produces exactly one UnitEvent, and
 * fails only when the result violates the phase's tool contract.
 */
const resolveEvent = (
  state: UnitState,
  result: PhaseAgentResult<PhaseAgentOutput>,
): { event: UnitEvent; reasoning: string | null } => {
  if (state.phase === "orient" || state.phase === "teach") {
    if (result.toolCalls.length > 0) {
      throw new EducationUnitContractError({
        message: `The ${state.phase} agent returned an unexpected tool call.`,
      });
    }
    return { event: { type: "teach_done" }, reasoning: null };
  }

  const allowedTools = EVENT_TOOLS_BY_PHASE[state.phase] ?? [];
  const phaseCalls = result.toolCalls.filter((call) =>
    allowedTools.includes(call.toolName),
  );
  const checkOffCalls = result.toolCalls.filter(
    (call) => call.toolName === "checkOffSyllabus",
  );
  if (phaseCalls.length !== 1 || checkOffCalls.length > 1) {
    throw new EducationUnitContractError({
      message: `The ${state.phase} agent must return exactly one phase event tool call.`,
    });
  }

  const call = phaseCalls[0];
  if (!call || !allowedTools.includes(call.toolName)) {
    throw new EducationUnitContractError({
      message: `The ${state.phase} agent returned an invalid phase event tool.`,
    });
  }

  const event = toUnitEvent(call.toolName, call.input);
  if (!event) {
    throw new EducationUnitContractError({
      message: `The ${state.phase} agent called ${call.toolName} with invalid arguments.`,
    });
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

const readSolveGrade = (
  result: PhaseAgentResult<PhaseAgentOutput>,
): { score: number; errorCodes: readonly string[] } | null => {
  const call = result.toolCalls.find((c) => c.toolName === "gradeSolution");
  if (!call) return null;
  const parsed = GradeSolutionInputSchema.safeParse(call.input);
  return parsed.success
    ? { score: parsed.data.score, errorCodes: parsed.data.errorCodes ?? [] }
    : null;
};

const readScenarioSpec = (
  result: PhaseAgentResult<PhaseAgentOutput>,
): ScenarioSpec | null => {
  const call = result.toolCalls.find(
    (c) => c.toolName === "recordScenarioSpec",
  );
  if (!call) return null;
  const parsed = ScenarioSpecSchema.safeParse(call.input);
  return parsed.success ? parsed.data : null;
};

/**
 * Takes a durable unit cursor and phase context, produces one validated turn
 * result, and fails only on a tagged model failure or phase-contract failure.
 */
export const runUnitTurn = async (
  input: UnitTurnInput,
  dependencies: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Promise<UnitTurnResult> => {
  const { state, recipe, contextBlock, transcript } = input;

  if (state.phase === "mastered") {
    throw new EducationUnitContractError({
      message: "Unit is already mastered; no turn to run.",
    });
  }

  const messages: ModelMessage[] = [
    { role: "user", content: contextBlock },
    ...transcript,
  ];

  const result = await Effect.runPromise(
    dependencies.runPhase(state, messages),
  );
  const parsedOutput = PhaseAgentOutputSchema.safeParse(result.object);
  if (!parsedOutput.success) {
    throw new EducationUnitContractError({
      message: `The ${state.phase} agent returned an invalid learner-facing message.`,
    });
  }
  const { event, reasoning } = resolveEvent(state, result);

  // Capture the force-advance signal BEFORE transition wipes connectGrills.
  const forcedConnectAdvance =
    state.phase === "connect" &&
    event.type === "connection_graded" &&
    !event.connected &&
    state.connectGrills + 1 >= recipe.policy.maxGrillsBeforeTeach;

  const nextState = transition(state, event, recipe.policy);

  const ratingWrite = writesGoldilocks(state, event)
    ? (readSolveGrade(result) ?? {
        score: recipe.grade.passAt,
        errorCodes: [] as readonly string[],
      })
    : null;
  const checkOffCall = result.toolCalls.find(
    (call) => call.toolName === "checkOffSyllabus",
  );
  const parsedCheckOff = CheckOffSyllabusInputSchema.safeParse(
    checkOffCall?.input,
  );
  const syllabusCheckOff =
    state.phase === "solve" &&
    state.pass === 2 &&
    event.type === "solution_graded" &&
    event.passed &&
    parsedCheckOff.success
      ? parsedCheckOff.data
      : null;

  return {
    assistantMessage: parsedOutput.data.assistantMessage,
    event,
    nextState,
    forcedConnectAdvance,
    gradeReasoning: reasoning,
    ratingWrite,
    syllabusCheckOff,
    scenarioSpec: readScenarioSpec(result),
  };
};
