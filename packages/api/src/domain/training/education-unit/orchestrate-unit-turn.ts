// education-unit/orchestrate-unit-turn.ts
//
// The unit turn engine — the ONLY module outside fsm.ts that applies a
// transition. It picks the phase agent for the current phase, runs its single
// structured model call, validates the emitted event evidence into a UnitEvent,
// applies fsm.transition(), and reports what persistence commits atomically.
//
// It is pure over its inputs except for the one model call (run through the
// phase agent's own typed retry). No DB, no Goldilocks, no HTTP — the caller
// (workspace-turn-orchestration) owns all of that.

import type { ModelMessage } from "ai";
import { Data, Effect } from "effect";

import type { PhaseAgentError } from "./agents/errors";
import type { PhaseAgentMode, PhaseAgentOutput } from "./agents/output-schema";
import type { PhaseAgentResult } from "./agents/run-phase-agent";
import type { ScenarioSpecRecord } from "./scenario-spec";
import type { UnitEvent, UnitRecipe, UnitState } from "./unit";
import { runEvaluatorAgent } from "./agents/evaluator-agent";
import {
  getPhaseAgentOutputSchema,
  LearnerFacingAssistantMessageSchema,
} from "./agents/output-schema";
import { runScenarioAgent } from "./agents/scenario-agent";
import { runTeachAgent } from "./agents/teach-agent";
import { transition, writesGoldilocks } from "./fsm";
import { toUnitEvent } from "./model-event";
import { ScenarioSpecSchema } from "./scenario-spec";
import { isRecallRecipe } from "./unit";

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
  solveTaskPending?: boolean;
  onPartialAssistantMessage?: (content: string) => void;
}

export interface UnitTurnResult {
  /** The learner-facing reply to persist and stream. */
  assistantMessage: string;
  /** The validated event evidence (or an auto teach_done) mapped to state. */
  event: UnitEvent;
  /** The durable cursor AFTER applying the event. */
  nextState: UnitState;
  /** The grader's one-sentence reasoning, for persistence metadata. */
  gradeReasoning: string | null;
  /**
   * Present on a scored pass-2 solve. The persistence boundary applies the
   * exactly-once guard before feeding this score to Goldilocks.
   */
  ratingWrite: { score: number; errorCodes: readonly string[] } | null;
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
  mode: PhaseAgentMode,
  onPartialAssistantMessage?: (content: string) => void,
) => Effect.Effect<
  PhaseAgentResult<PhaseAgentOutput>,
  PhaseAgentError | EducationUnitContractError
>;

export interface UnitTurnDependencies {
  readonly runPhase: UnitPhaseRunner;
}

const invalidMode = (state: UnitState, mode: PhaseAgentMode) =>
  Effect.fail(
    new EducationUnitContractError({
      message: `Output mode ${mode} is illegal in phase ${state.phase}.`,
    }),
  );

const runPhaseForState: UnitPhaseRunner = (
  state,
  messages,
  contextBlock,
  mode,
  onPartialAssistantMessage,
) => {
  switch (state.phase) {
    case "orient":
      return mode === "orient"
        ? runTeachAgent(
            "orient",
            messages,
            contextBlock,
            onPartialAssistantMessage,
          )
        : invalidMode(state, mode);
    case "connect":
      return mode === "connect-presentation" || mode === "connect-evaluation"
        ? runScenarioAgent(
            messages,
            contextBlock,
            mode,
            onPartialAssistantMessage,
          )
        : invalidMode(state, mode);
    case "solve":
      return mode === "solve-presentation" ||
        mode === "recall-presentation" ||
        mode === "solve-evaluation"
        ? runEvaluatorAgent(
            messages,
            contextBlock,
            mode,
            onPartialAssistantMessage,
          )
        : invalidMode(state, mode);
    case "teach":
      return mode === "teach"
        ? runTeachAgent(
            "seam",
            messages,
            contextBlock,
            onPartialAssistantMessage,
          )
        : invalidMode(state, mode);
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

const resolvePhaseMode = (
  input: UnitTurnInput,
): Effect.Effect<PhaseAgentMode, EducationUnitContractError> => {
  const storedSpec = input.storedScenarioSpec ?? null;
  const hasCurrentSpec =
    storedSpec !== null && (storedSpec.pass ?? 1) === input.state.pass;

  switch (input.state.phase) {
    case "orient":
      return Effect.succeed("orient");
    case "teach":
      return storedSpec && (storedSpec.pass ?? 1) === input.state.pass
        ? Effect.succeed("teach")
        : Effect.fail(
            new EducationUnitContractError({
              message: "Teach requires the finished round's ScenarioSpec.",
            }),
          );
    case "connect":
      if (hasCurrentSpec) return Effect.succeed("connect-evaluation");
      return input.state.pass === 1 && storedSpec === null
        ? Effect.succeed("connect-presentation")
        : Effect.fail(
            new EducationUnitContractError({
              message:
                "Connect cannot begin without the current round's ScenarioSpec.",
            }),
          );
    case "solve":
      if (input.solveTaskPending) {
        return hasCurrentSpec
          ? Effect.succeed("solve-presentation")
          : Effect.fail(
              new EducationUnitContractError({
                message:
                  "The opening Solve task requires the current round's ScenarioSpec.",
              }),
            );
      }
      if (hasCurrentSpec) return Effect.succeed("solve-evaluation");
      return isRecallRecipe(input.state.recipeVersion) && storedSpec === null
        ? Effect.succeed("recall-presentation")
        : Effect.fail(
            new EducationUnitContractError({
              message:
                "Solve evaluation requires the current round's ScenarioSpec.",
            }),
          );
    case "mastered":
      return Effect.fail(
        new EducationUnitContractError({
          message: "Unit is already mastered; no turn to run.",
        }),
      );
  }
};

const resolveEvent = (
  state: UnitState,
  output: PhaseAgentOutput,
  grade: { passAt: number },
): Effect.Effect<
  { event: UnitEvent; reasoning: string | null },
  EducationUnitContractError
> => {
  if (state.phase === "orient" || state.phase === "teach") {
    return Effect.succeed({ event: { type: "teach_done" }, reasoning: null });
  }
  if (!output.event) {
    return Effect.fail(
      new EducationUnitContractError({
        message: `The ${state.phase} output did not include event evidence.`,
      }),
    );
  }
  const event = toUnitEvent(output.event, grade);
  if (!event) {
    return Effect.fail(
      new EducationUnitContractError({
        message: `The ${state.phase} output contained incoherent grading evidence.`,
      }),
    );
  }
  const reasoning = "reasoning" in output.event ? output.event.reasoning : null;
  return Effect.succeed({ event, reasoning });
};

const readScenarioSpec = (
  output: PhaseAgentOutput,
  pass: UnitState["pass"],
): ScenarioSpecRecord | null => {
  if (!output.scenarioSpec) return null;
  const parsed = ScenarioSpecSchema.safeParse(output.scenarioSpec);
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

    const mode = yield* resolvePhaseMode(input);
    const messages: ModelMessage[] = [...transcript];

    const result = yield* dependencies.runPhase(
      state,
      messages,
      contextBlock,
      mode,
      input.onPartialAssistantMessage,
    );
    const parsedOutput = getPhaseAgentOutputSchema(mode).safeParse(
      result.object,
    );
    if (!parsedOutput.success) {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message: `The ${state.phase} agent returned an invalid learner-facing message.`,
        }),
      );
    }
    const output = parsedOutput.data;
    const learnerMessage = LearnerFacingAssistantMessageSchema.safeParse(
      output.assistantMessage,
    );
    if (!learnerMessage.success) {
      return yield* Effect.fail(
        new EducationUnitContractError({
          message: `The ${state.phase} agent returned an incomplete learner-facing message.`,
        }),
      );
    }
    const { event, reasoning } = yield* resolveEvent(
      state,
      output,
      recipe.grade,
    );
    // A seam teach records the NEXT round's evolved spec; every other recorder
    // (connect posing, recall's opening solve) records the current round's.
    const scenarioPass =
      state.phase === "teach"
        ? (Math.min(state.pass + 1, 3) as UnitState["pass"])
        : state.pass;
    const storedSpec = input.storedScenarioSpec ?? null;
    const emittedSpec = readScenarioSpec(output, scenarioPass);
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
      if (
        !recordedSpec ||
        !storedSpec ||
        (storedSpec.pass ?? 1) !== state.pass
      ) {
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

    const nextState = transition(state, event, recipe);

    // The rating evidence IS the event: toUnitEvent already validated the
    // score and error codes, so a scored write-round Solve can never lack evidence.
    const ratingWrite =
      writesGoldilocks(state, event, recipe) && event.type === "solution_graded"
        ? { score: event.score, errorCodes: event.errorCodes }
        : null;
    return {
      assistantMessage: learnerMessage.data,
      event,
      nextState,
      gradeReasoning: reasoning,
      ratingWrite,
      scenarioSpec: recordedSpec,
    };
  });
