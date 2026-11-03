import { Data, Effect } from "effect";

import type {
  DifficultyVector,
  UnitPartDraft,
  UnitPreparedStep,
  UnitRoundSpec,
} from "@acme/validators";

import type { Memory } from "../../memory/types";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { UnitMove } from "./unit-policy";
import type { PersistedUnitRun } from "./unit-state";
import { renderPart } from "./agent-contracts";
import { runMentorLessonAgent, runMentorPartsAgent } from "./mentor-agent";
import {
  createMentorContext,
  createPartsContext,
} from "./unit-context";
import { uncoveredCriterionIds } from "./unit-policy";
import { activeRound, nextUnitMove, partLetter } from "./unit-state";

export class UnitTurnContractError extends Data.TaggedError(
  "UnitTurnContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitTurnContractError({ message }));

export interface DraftDependencies {
  readonly runMentorLesson: typeof runMentorLessonAgent;
  readonly runMentorParts: typeof runMentorPartsAgent;
}

export const LIVE_DRAFT_DEPENDENCIES: DraftDependencies = {
  runMentorLesson: runMentorLessonAgent,
  runMentorParts: runMentorPartsAgent,
};

const midpoint = ([minimum, maximum]: readonly [number, number]): number =>
  Math.round((minimum + maximum) / 2);

export const difficultyVectorFor = (
  run: PersistedUnitRun,
): Effect.Effect<DifficultyVector, UnitTurnContractError> => {
  const format = run.difficultySnapshot?.format;
  const dialPreset = run.difficultySnapshot?.dialPreset;
  if (!format || !dialPreset) {
    return contractFailure(
      "The unit has no calibrated format and difficulty preset.",
    );
  }
  return Effect.succeed({
    formatId: format.id,
    reasoningPathSteps: midpoint(dialPreset.steps),
    withheldGivens: midpoint(dialPreset.withheldGivens),
    embeddedAlternatives: midpoint(dialPreset.alternatives),
  });
};

export const draftLesson = (
  {
    run,
    experience,
    memories,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    experience: EducationExperienceDefinition;
    memories: readonly Memory[];
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: DraftDependencies = LIVE_DRAFT_DEPENDENCIES,
): Effect.Effect<string, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    if (!run.difficultySnapshot) {
      return yield* contractFailure("The unit has no difficulty snapshot.");
    }
    const { object } = yield* deps.runMentorLesson({
      context: createMentorContext({
        unitContext: run.unitContext,
        difficulty: run.difficultySnapshot,
        memories,
        steps: run.cursor.steps,
      }),
      experience,
      onPartialAssistantMessage,
    });
    return object.assistantMessage;
  });

export interface PartsDraft {
  readonly acknowledgment: string | null;
  readonly narrative: string | null;
  readonly parts: readonly UnitPartDraft[];
  /** The letter of each part, in order. */
  readonly letters: readonly string[];
}

/** Everything about the parts a move writes that follows from the history. */
const planParts = (
  run: PersistedUnitRun,
  move: Extract<UnitMove, { kind: "open_round" | "next_part" }>,
): Effect.Effect<
  {
    spec: UnitRoundSpec;
    opensRound: boolean;
    letters: string[];
    mustCoverCriterionIds: string[];
    hypothesis: string | null;
  },
  UnitTurnContractError
> => {
  const round = move.kind === "next_part" ? activeRound(run.cursor) : null;
  const spec = move.kind === "open_round" ? move.spec : round?.spec;
  if (!spec) return contractFailure("There is no round to continue.");
  const written = round?.parts.length ?? 0;
  const count = spec.pacing === "all_at_once" ? spec.partCount : 1;
  const letters = Array.from({ length: count }, (_, index) =>
    partLetter(written + index),
  );
  const writesLastPart = written + count === spec.partCount;
  const lastResult = round?.parts.at(-1)?.result ?? null;
  return Effect.succeed({
    spec,
    opensRound: round === null,
    letters,
    mustCoverCriterionIds: writesLastPart
      ? round
        ? uncoveredCriterionIds(round)
        : spec.criterionIds
      : [],
    hypothesis: lastResult && !lastResult.met ? lastResult.hypothesis : null,
  });
};

export const draftParts = (
  {
    run,
    move,
    experience,
    acknowledgesExplanation,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    move: Extract<UnitMove, { kind: "open_round" | "next_part" }>;
    experience: EducationExperienceDefinition;
    acknowledgesExplanation: boolean;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: DraftDependencies = LIVE_DRAFT_DEPENDENCIES,
): Effect.Effect<PartsDraft, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    if (!run.difficultySnapshot) {
      return yield* contractFailure("The unit has no difficulty snapshot.");
    }
    const plan = yield* planParts(run, move);
    const difficultyVector = yield* difficultyVectorFor(run);
    const { object } = yield* deps.runMentorParts({
      context: `${createPartsContext({
        unitContext: run.unitContext,
        difficulty: run.difficultySnapshot,
        steps: run.cursor.steps,
        opensRound: plan.opensRound,
      })}

## Exact structural target
Author the parts to this server-owned target: ${JSON.stringify(difficultyVector)}.`,
      experience,
      shape: {
        selectedResponse: run.difficultySnapshot.format?.kind === "mcq",
        roundCriterionIds: plan.spec.criterionIds,
        partCount: plan.letters.length,
        mustCoverCriterionIds: plan.mustCoverCriterionIds,
        opensRound: plan.opensRound,
        acknowledgesExplanation,
      },
      label: plan.spec.label,
      letters: plan.letters,
      hypothesis: plan.hypothesis,
      onPartialAssistantMessage,
    });
    return {
      acknowledgment: object.acknowledgment,
      narrative: object.narrative,
      letters: plan.letters,
      parts: object.parts.map((part) => ({
        question: renderPart(part),
        criterionIds: part.criterionIds,
        verifier: part.verifier,
      })),
    };
  });

/**
 * Writes whatever the unit does next, ahead of the learner asking for it. Null
 * when the next move writes nothing.
 */
export const draftNextStep = (
  {
    run,
    experience,
    memories,
  }: {
    run: PersistedUnitRun;
    experience: EducationExperienceDefinition;
    memories: readonly Memory[];
  },
  deps: DraftDependencies = LIVE_DRAFT_DEPENDENCIES,
): Effect.Effect<
  UnitPreparedStep["draft"] | null,
  UnitAgentError | UnitTurnContractError
> =>
  Effect.gen(function* () {
    const move = nextUnitMove(run);
    switch (move.kind) {
      case "complete":
        return null;
      case "teach":
        return {
          kind: "lesson" as const,
          inputKey: null,
          lesson: yield* draftLesson({ run, experience, memories }, deps),
        };
      case "open_round":
      case "next_part": {
        const draft = yield* draftParts(
          { run, move, experience, acknowledgesExplanation: false },
          deps,
        );
        return {
          kind: "parts" as const,
          narrative: draft.narrative,
          parts: [...draft.parts],
        };
      }
    }
  });
