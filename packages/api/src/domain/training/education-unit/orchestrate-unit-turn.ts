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
import type { ScenarioSpecRecord } from "./scenario-spec";
import type { UnitEvent, UnitRecipe, UnitState } from "./unit";
import { toUnitEvent } from "../workspace-ai/fsm-tools";
import { CheckOffSyllabusInputSchema } from "./agents/check-off-syllabus.tool";
import { runEvaluatorAgent } from "./agents/evaluator-agent";
import { PhaseAgentOutputSchema } from "./agents/output-schema";
import { runScenarioAgent } from "./agents/scenario-agent";
import { runTeachAgent } from "./agents/teach-agent";
import {
  shouldTeachMissedConnection,
  transition,
  writesGoldilocks,
} from "./fsm";
import { ScenarioSpecSchema } from "./scenario-spec";

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
  /**
   * The spec already stored on the run, pass-tagged. Used only to enforce
   * that a pass-2 Solve is never presented without a grading spec: either
   * one recorded this turn or a stored pass-2 one. Defaults to null.
   */
  storedScenarioSpec?: ScenarioSpecRecord | null;
  onPartialAssistantMessage?: (content: string) => void;
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
   * The ScenarioSpec the posing agent reverse-engineered this turn, stamped
   * with the pass it was recorded on. Null on every turn that doesn't record
   * one — persistence coalesces null onto the stored spec, so it is
   * preserved, not wiped.
   */
  scenarioSpec: ScenarioSpecRecord | null;
}

export type UnitPhaseRunner = (
  state: UnitState,
  messages: ModelMessage[],
  contextBlock: string,
  onPartialAssistantMessage?: (content: string) => void,
) => Effect.Effect<
  PhaseAgentResult<PhaseAgentOutput>,
  PhaseAgentError | EducationUnitContractError
>;

export interface UnitTurnDependencies {
  readonly runPhase: UnitPhaseRunner;
}

const runPhaseForState: UnitPhaseRunner = (
  state: UnitState,
  messages: ModelMessage[],
  contextBlock: string,
  onPartialAssistantMessage,
) => {
  switch (state.phase) {
    case "orient":
      return runTeachAgent(
        "orient",
        messages,
        contextBlock,
        onPartialAssistantMessage,
      );
    case "connect":
      return runScenarioAgent(
        messages,
        contextBlock,
        onPartialAssistantMessage,
      );
    case "solve":
      // Every round's Solve is graded by the one evaluator; whether the score
      // reaches Goldilocks is the recipe's call (writesGoldilocks / ratingWrite),
      // never the agent's.
      return runEvaluatorAgent(
        messages,
        contextBlock,
        onPartialAssistantMessage,
      );
    case "teach":
      return runTeachAgent(
        "seam",
        messages,
        contextBlock,
        onPartialAssistantMessage,
      );
    case "mastered":
      return Effect.fail(
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
  grade: { passAt: number },
): Effect.Effect<
  { event: UnitEvent; reasoning: string | null },
  EducationUnitContractError
> => {
  if (state.phase === "orient") {
    if (result.toolCalls.length > 0) {
      return Effect.fail(
        new EducationUnitContractError({
          message: `The ${state.phase} agent returned an unexpected tool call.`,
        }),
      );
    }
    return Effect.succeed({
      event: { type: "teach_done" },
      reasoning: null,
    });
  }

  if (state.phase === "teach") {
    const specCalls = result.toolCalls.filter(
      (call) => call.toolName === "recordScenarioSpec",
    );
    if (result.toolCalls.length !== 1 || specCalls.length !== 1) {
      return Effect.fail(
        new EducationUnitContractError({
          message:
            "The teach agent must record exactly one evolved ScenarioSpec.",
        }),
      );
    }
    return Effect.succeed({
      event: { type: "teach_done" },
      reasoning: null,
    });
  }

  const allowedTools = EVENT_TOOLS_BY_PHASE[state.phase] ?? [];
  const phaseCalls = result.toolCalls.filter((call) =>
    allowedTools.includes(call.toolName),
  );
  const checkOffCalls = result.toolCalls.filter(
    (call) => call.toolName === "checkOffSyllabus",
  );
  if (phaseCalls.length !== 1 || checkOffCalls.length > 1) {
    return Effect.fail(
      new EducationUnitContractError({
        message: `The ${state.phase} agent must return exactly one phase event tool call.`,
      }),
    );
  }

  const call = phaseCalls[0];
  if (!call || !allowedTools.includes(call.toolName)) {
    return Effect.fail(
      new EducationUnitContractError({
        message: `The ${state.phase} agent returned an invalid phase event tool.`,
      }),
    );
  }

  const event = toUnitEvent(call.toolName, call.input, grade);
  if (!event) {
    return Effect.fail(
      new EducationUnitContractError({
        message: `The ${state.phase} agent called ${call.toolName} with invalid arguments.`,
      }),
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

  return Effect.succeed({ event, reasoning });
};

const readScenarioSpec = (
  result: PhaseAgentResult<PhaseAgentOutput>,
  pass: UnitState["pass"],
): ScenarioSpecRecord | null => {
  const call = result.toolCalls.find(
    (c) => c.toolName === "recordScenarioSpec",
  );
  if (!call) return null;
  const parsed = ScenarioSpecSchema.safeParse(call.input);
  // The pass is stamped here, from durable state — the model never sets it.
  return parsed.success ? { ...parsed.data, pass } : null;
};

/**
 * Takes a durable unit cursor and phase context, produces one validated turn
 * result, and fails only on a tagged model failure or phase-contract failure.
 */
export const runUnitTurn = (
  input: UnitTurnInput,
  dependencies: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Effect.Effect<
  UnitTurnResult,
  PhaseAgentError | EducationUnitContractError
> =>
  Effect.gen(function* () {
    const { state, recipe, contextBlock, transcript } = input;

    if (state.phase === "mastered") {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message: "Unit is already mastered; no turn to run.",
        }),
      );
    }

    const messages: ModelMessage[] = [...transcript];

    const result = yield* dependencies.runPhase(
      state,
      messages,
      contextBlock,
      input.onPartialAssistantMessage,
    );
    const parsedOutput = PhaseAgentOutputSchema.safeParse(result.object);
    if (!parsedOutput.success) {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message: `The ${state.phase} agent returned an invalid learner-facing message.`,
        }),
      );
    }
    const { event, reasoning } = yield* resolveEvent(
      state,
      result,
      recipe.grade,
    );
    // A seam teach records the NEXT round's evolved spec; every other recorder
    // (connect posing, recall's opening solve) records the current round's.
    const scenarioPass =
      state.phase === "teach"
        ? ((Math.min(state.pass + 1, 3) as UnitState["pass"]))
        : state.pass;
    const storedSpec = input.storedScenarioSpec ?? null;
    const emittedSpec = readScenarioSpec(result, scenarioPass);
    // The target skill is the cross-round invariant. Teach evolves the world,
    // but the durable opening spec—not model wording—owns the skill's identity.
    const recordedSpec =
      state.phase === "teach" && emittedSpec && storedSpec
        ? { ...emittedSpec, targetSkill: storedSpec.targetSkill }
        : emittedSpec;

    if (state.phase === "teach") {
      // Evolution requires a world to evolve: the just-finished round's spec
      // must be stored, and one valid evolved spec must be recorded. The same
      // surface/world is expected — evolution, not replacement — so there is
      // deliberately no new-surface check here.
      if (!recordedSpec || !storedSpec || (storedSpec.pass ?? 1) !== state.pass) {
        return yield* Effect.fail(
          new EducationUnitContractError({
            message:
              "Teach requires the finished round's ScenarioSpec and must record one valid evolved ScenarioSpec.",
          }),
        );
      }
    }

    // A "prompted" continue is the turn that presents a task. Two invariants
    // hang off that moment, enforced the same way a scored Solve verdict is —
    // failing loudly instead of silently degrading a later round:
    //   - Connect posing a scenario MUST record its ScenarioSpec: it is the
    //     round's answer key and the next round's evolution substrate.
    //   - A Solve MUST have the current round's grading spec (recorded this
    //     turn on recall, or already stored by Connect/Teach) — otherwise the
    //     evaluator would grade against the wrong round's canonical answer.
    const posesTask =
      event.type === "phase_continues" && event.reason === "prompted";
    // On every round — including round one, where Connect itself recorded the
    // spec while posing — a stored current-round spec means the scenario is
    // live: later connect turns grade it, never replace it.
    const hasActiveScenario =
      state.phase === "connect" &&
      storedSpec != null &&
      (storedSpec.pass ?? 1) === state.pass;
    if (hasActiveScenario && (posesTask || recordedSpec)) {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message:
            "Connect must grade the active scenario instead of replacing it.",
        }),
      );
    }
    if (state.phase === "connect" && posesTask && !recordedSpec) {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message:
            "The connect agent posed a scenario without recording a valid ScenarioSpec.",
        }),
      );
    }
    const gradingSpec =
      recordedSpec ??
      ((storedSpec?.pass ?? 1) === state.pass ? storedSpec : null);
    if (state.phase === "solve" && posesTask && !gradingSpec) {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message:
            "A Solve was presented without the current round's ScenarioSpec to grade against.",
        }),
      );
    }

    // Capture the teach-help signal BEFORE transition wipes connectGrills.
    // Only v1 recipes actually advance on it; v2 keeps looping with escalated
    // help, so the "forced advance" flag stays false there by construction.
    const forcedConnectAdvance =
      recipe.policy.advanceOnMaxGrills &&
      event.type === "connection_graded" &&
      shouldTeachMissedConnection(state, event, recipe);

    const nextState = transition(state, event, recipe);

    // The rating evidence IS the event: toUnitEvent already validated the
    // score and error codes, so a scored write-round Solve can never lack evidence.
    const ratingWrite =
      writesGoldilocks(state, event, recipe) &&
      event.type === "solution_graded"
        ? { score: event.score, errorCodes: event.errorCodes }
        : null;
    const checkOffCall = result.toolCalls.find(
      (call) => call.toolName === "checkOffSyllabus",
    );
    const parsedCheckOff = CheckOffSyllabusInputSchema.safeParse(
      checkOffCall?.input,
    );
    const syllabusCheckOff =
      state.phase === "solve" &&
      state.pass === recipe.passes &&
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
      scenarioSpec: recordedSpec,
    };
  });
