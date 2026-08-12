import { Data, Effect } from "effect";

import type {
  DifficultyVector,
  ScenarioEvaluationContract,
  UnitReviewChallenge,
} from "@acme/validators";

import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import type { ReviewPresentationOutput } from "./agent-contracts";
import { renderReviewPresentation } from "./agent-contracts";
import { runReviewPresentationAgent } from "./review-agent";

export class UnitTurnContractError extends Data.TaggedError(
  "UnitTurnContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitTurnContractError({ message }));

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
  testedCriterionIds: run.unitContext.judgment.criteria.map(
    (criterion) => criterion.id,
  ),
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
    experience,
    context,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    experience: EducationExperienceDefinition;
    context: string;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: PrefillDependencies = {
    runReviewPresentation: runReviewPresentationAgent,
  },
): Effect.Effect<UnitReviewChallenge, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const difficultyVector = yield* difficultyVectorFor(run);
    const result = yield* deps.runReviewPresentation({
      messages: [],
      context: presentationContext(context, difficultyVector),
      experience,
      pass: run.reviewPass,
      selectedResponse: run.difficultySnapshot?.format?.kind === "mcq",
    });
    const prompt = renderReviewPresentation(result.object);
    onPartialAssistantMessage?.(prompt);
    return {
      prompt,
      difficultyVector,
      contract: evaluationContractFor(
        run,
        prompt,
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
