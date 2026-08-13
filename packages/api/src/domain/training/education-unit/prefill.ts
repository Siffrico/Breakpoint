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
import { renderReviewPresentation } from "./agent-contracts";
import { runMentorScenarioAgent } from "./mentor-agent";

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

export const scenarioFromPresentation = ({
  run,
  presentation,
}: {
  run: PersistedUnitRun;
  presentation: ReviewPresentationOutput;
}): Effect.Effect<UnitReviewChallenge, UnitTurnContractError> =>
  Effect.gen(function* () {
    const difficultyVector = yield* difficultyVectorFor(run);
    const prompt = renderReviewPresentation(presentation);
    return {
      prompt,
      difficultyVector,
      contract: evaluationContractFor(run, prompt, presentation.verifier),
    };
  });

export interface PrefillDependencies {
  readonly runMentorScenario: typeof runMentorScenarioAgent;
}

/** Every scenario authoring path produces the same server-owned contract. */
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
    runMentorScenario: runMentorScenarioAgent,
  },
): Effect.Effect<UnitReviewChallenge, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const difficultyVector = yield* difficultyVectorFor(run);
    const result = yield* deps.runMentorScenario({
      context: presentationContext(context, difficultyVector),
      experience,
      pass:
        run.cursor.step.kind === "pass_result"
          ? run.cursor.step.attempt + 1
          : run.reviewPass,
      selectedResponse: run.difficultySnapshot?.format?.kind === "mcq",
    });
    const challenge = yield* scenarioFromPresentation({
      run,
      presentation: result.object,
    });
    onPartialAssistantMessage?.(challenge.prompt);
    return challenge;
  });
