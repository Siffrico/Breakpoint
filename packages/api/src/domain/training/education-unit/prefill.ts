import type { ModelMessage } from "ai";
import { Data, Effect } from "effect";

import type {
  DifficultyVector,
  ScenarioEvaluationContract,
  UnitReviewChallenge,
} from "@acme/validators";

import type { ReviewPresentationOutput } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import { runReviewPresentationAgent } from "./review-agent";

export class UnitTurnContractError extends Data.TaggedError(
  "UnitTurnContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitTurnContractError({ message }));

/**
 * Three disjoint views of the same run, built by separate functions. There is
 * no audience flag to get wrong, so the mentor's view cannot reach the critic
 * and the critic never sees the difficulty it was graded against.
 */
export interface UnitContextBuilders {
  readonly forMentor: (run: PersistedUnitRun) => string;
  readonly forPresenter: (run: PersistedUnitRun) => string;
  readonly forCritic: (run: PersistedUnitRun) => string;
}

export const readContext = (
  build: (run: PersistedUnitRun) => string,
  run: PersistedUnitRun,
): Effect.Effect<string, UnitTurnContractError> =>
  Effect.try({
    try: () => build(run),
    catch: (cause) =>
      new UnitTurnContractError({
        message:
          cause instanceof Error
            ? cause.message
            : "Unit context could not be constructed.",
      }),
  });

const midpoint = ([minimum, maximum]: readonly [number, number]): number =>
  Math.round((minimum + maximum) / 2);

const difficultyVectorFor = (
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

const evaluationContractFor = (
  run: PersistedUnitRun,
  prompt: string,
  verifier: ReviewPresentationOutput["verifier"],
): ScenarioEvaluationContract => ({
  version: 1,
  runKind: run.kind,
  scenarioPromptSummary:
    prompt
      .split(/\n\s*\n/)
      .find((part) => part.trim().length > 0)
      ?.trim() ?? prompt,
  testedDimensions: run.masteryContract.dimensions.map((dimension) => ({
    dimensionId: dimension.id,
    promptRole: dimension.description,
    expectedStrongMoves: dimension.passSignals,
    acceptableVariants: [],
    commonWrongMoves: [
      ...dimension.failSignals,
      ...dimension.surrogateTraps,
    ].slice(0, 6),
    scoreBands: {
      strong: `Demonstrates ${dimension.passSignals.join("; ")}.`,
      partial: `Shows part of ${dimension.description}, but leaves a material gap in the reasoning.`,
      weak: `Shows ${dimension.failSignals.join("; ")}.`,
    },
  })),
  learnerVisibleCriteria: run.masteryContract.dimensions.map(
    (dimension) => dimension.description,
  ),
  evaluatorNotes: run.masteryContract.dimensions
    .flatMap((dimension) => dimension.surrogateTraps)
    .slice(0, 6),
  verifier,
});

const presentationContext = (
  context: string,
  difficultyVector: DifficultyVector,
): string => `${context}

## Exact structural target
Author the scenario to this server-owned target: ${JSON.stringify(difficultyVector)}. Return only the learner-facing scenario in assistantMessage.`;

export interface PrefillDependencies {
  readonly runReviewPresentation: typeof runReviewPresentationAgent;
}

/**
 * Writes one scenario for the run's pending solve. Every caller goes through
 * here — the live open, the teach turn's speculative authoring, and the next
 * pass's background pre-generation — so all three produce the same shape.
 */
export const prefillScenario = (
  {
    run,
    transcript,
    experience,
    buildContext,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    transcript: readonly ModelMessage[];
    experience: EducationExperienceDefinition;
    buildContext: Pick<UnitContextBuilders, "forPresenter">;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: PrefillDependencies = {
    runReviewPresentation: runReviewPresentationAgent,
  },
): Effect.Effect<UnitReviewChallenge, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const context = yield* readContext(buildContext.forPresenter, run);
    const difficultyVector = yield* difficultyVectorFor(run);
    const result = yield* deps.runReviewPresentation({
      messages: transcript,
      context: presentationContext(context, difficultyVector),
      experience,
      pass: run.reviewPass,
      onPartialAssistantMessage,
    });
    return {
      prompt: result.object.assistantMessage,
      difficultyVector,
      contract: evaluationContractFor(
        run,
        result.object.assistantMessage,
        result.object.verifier,
      ),
    };
  });

/**
 * The challenge already parked on the next unfinished solve. Read during the
 * teach step, where the head is still a capability, so it cannot use the head.
 */
export const parkedChallenge = (
  run: PersistedUnitRun,
): UnitReviewChallenge | null => {
  const solve = run.todos.find(
    (todo) => todo.kind === "solve" && todo.status !== "completed",
  );
  return solve?.kind === "solve" ? solve.challenge : null;
};
