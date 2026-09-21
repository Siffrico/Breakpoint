import type { ModelMessage } from "ai";
import { Effect } from "effect";

import type {
  EvaluationDimensionResult,
  WorkspaceTurnAction,
} from "@acme/validators";

import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import { hasModelGap, renderGradeMessage } from "./agent-contracts";
import { runMentorScenarioAgent, runMentorTeachingAgent } from "./mentor-agent";
import {
  prefillScenario,
  scenarioFromPresentation,
  UnitTurnContractError,
} from "./prefill";
import { runReviewGradeAgent } from "./review-agent";
import {
  assertInteractionId,
  attachPreparedScenario,
  isRatingEligibleScenario,
  preparedScenario,
  presentScenario,
  repeatTeaching,
  settleScenario,
} from "./unit-state";

export interface UnitAgentContexts {
  readonly mentor: string;
  readonly mentorScenario: string;
  readonly critique: {
    readonly judgeAnswer: string;
  };
}
export { UnitTurnContractError } from "./prefill";

export interface UnitTurnResult {
  readonly assistantMessage: string;
  readonly nextRun: PersistedUnitRun;
  readonly actor: "mentor" | "reviewer";
  readonly reviewGrade: {
    readonly checksMet: number;
    readonly checksTotal: number;
    readonly errorCodes: readonly string[];
    readonly reasoning: string;
    readonly dimensionResults: readonly EvaluationDimensionResult[];
    readonly passed: boolean;
  } | null;
  readonly ratingWrite: {
    readonly checksMet: number;
    readonly checksTotal: number;
    readonly errorCodes: readonly string[];
  } | null;
  readonly presentedReviewChallenge: boolean;
}

export interface UnitTurnDependencies {
  readonly runMentorTeaching: typeof runMentorTeachingAgent;
  readonly runMentorScenario: typeof runMentorScenarioAgent;
  readonly runReviewGrade: typeof runReviewGradeAgent;
}

const LIVE_DEPENDENCIES: UnitTurnDependencies = {
  runMentorTeaching: runMentorTeachingAgent,
  runMentorScenario: runMentorScenarioAgent,
  runReviewGrade: runReviewGradeAgent,
};

const contractFailure = (message: string) =>
  Effect.fail(new UnitTurnContractError({ message }));

const asTurnError = Effect.mapError(
  (error: { readonly message: string }) =>
    new UnitTurnContractError({ message: error.message }),
);

const latestUserText = (transcript: readonly ModelMessage[]): string | null => {
  const message = [...transcript]
    .reverse()
    .find((candidate) => candidate.role === "user");
  return message && typeof message.content === "string"
    ? message.content
    : null;
};

const selectedResponse = (run: PersistedUnitRun) =>
  run.difficultySnapshot?.format?.kind === "mcq";

const openScenario = ({
  run,
  experience,
  contexts,
  onPartialAssistantMessage,
  deps,
}: {
  run: PersistedUnitRun;
  experience: EducationExperienceDefinition;
  contexts: UnitAgentContexts;
  onPartialAssistantMessage?: (content: string) => void;
  deps: UnitTurnDependencies;
}): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const prepared = preparedScenario(run);
    const challenge =
      prepared ??
      (run.cursor.step.kind === "pass_result"
        ? yield* prefillScenario(
            {
              run,
              experience,
              context: contexts.mentorScenario,
              onPartialAssistantMessage,
            },
            deps,
          )
        : yield* contractFailure(
            "The mentor did not prepare the first scenario.",
          ));
    if (prepared) onPartialAssistantMessage?.(challenge.prompt);
    const nextRun = yield* presentScenario({ run, challenge }).pipe(
      asTurnError,
    );
    return {
      assistantMessage: challenge.prompt,
      nextRun,
      actor: "mentor" as const,
      reviewGrade: null,
      ratingWrite: null,
      presentedReviewChallenge: true,
    };
  });

const evidencedTargets = (
  run: PersistedUnitRun,
  results: readonly EvaluationDimensionResult[],
): string[] => {
  const passingSkills = new Set(
    results.flatMap((result) =>
      !result.met
        ? []
        : (run.unitContext.judgment.criteria.find(
            (criterion) => criterion.id === result.dimensionId,
          )?.skills ?? []),
    ),
  );
  return run.unitContext.targets
    .filter((target) => passingSkills.has(target.skill))
    .map((target) => target.id);
};

const gradeScenario = ({
  run,
  transcript,
  experience,
  contexts,
  onPartialAssistantMessage,
  deps,
}: {
  run: PersistedUnitRun;
  transcript: readonly ModelMessage[];
  experience: EducationExperienceDefinition;
  contexts: UnitAgentContexts;
  onPartialAssistantMessage?: (content: string) => void;
  deps: UnitTurnDependencies;
}): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const step = run.cursor.step;
    if (step.kind !== "scenario" || !step.challenge) {
      return yield* contractFailure("There is no presented scenario to grade.");
    }
    const learnerAnswer = latestUserText(transcript);
    if (!learnerAnswer) {
      return yield* contractFailure(
        "Grading requires the learner's latest answer.",
      );
    }
    const ratingEligible = isRatingEligibleScenario(run);
    const { object: output } = yield* deps.runReviewGrade({
      messages: [{ role: "user", content: learnerAnswer }],
      teachingHistory: transcript.slice(0, -1),
      context: contexts.critique.judgeAnswer,
      activeChallenge: step.challenge,
      experience,
      shape: {
        testedDimensionIds: step.challenge.contract.testedCriterionIds,
        learnerAnswer,
      },
      priorErrorCodes: run.cursor.errorCodeHistory,
      onPartialAssistantMessage,
    });
    const dimensionResults = output.dimensionResults;
    const evidenceIds = evidencedTargets(run, dimensionResults);
    const gap = hasModelGap(dimensionResults);
    const errorCodes = gap
      ? output.errorCodes.length > 0
        ? output.errorCodes
        : [
            ...dimensionResults
              .filter((dimension) => !dimension.met)
              .map((dimension) => `gap-${dimension.dimensionId}`),
            ...run.unitContext.targets
              .filter((target) => !evidenceIds.includes(target.id))
              .map((target) => `unevidenced-${target.id}`),
          ]
            .slice(0, 3)
            .map((code) => code.slice(0, 40))
      : [];
    const checksMet = dimensionResults.filter((result) => result.met).length;
    const checksTotal = dimensionResults.length;
    const nextRun = yield* settleScenario({
      run,
      passed: !gap,
      errorCodes,
      causeType: gap ? output.causeType : null,
      hypothesis: gap ? (output.diagnosis?.hypothesis ?? null) : null,
      dimensionResults,
      evidencedTargetIds: evidenceIds,
    }).pipe(asTurnError);
    return {
      assistantMessage: renderGradeMessage(output),
      nextRun,
      actor: "reviewer" as const,
      reviewGrade: {
        checksMet,
        checksTotal,
        errorCodes,
        reasoning: output.scratchpad,
        dimensionResults,
        passed: !gap,
      },
      ratingWrite: ratingEligible
        ? { checksMet, checksTotal, errorCodes }
        : null,
      presentedReviewChallenge: false,
    };
  });

/**
 * Teach, then hand straight into the scenario that checks the teaching. Used
 * both to open a unit and to re-teach after a `never-learned-it` diagnosis:
 * an idea the learner was never given cannot be drawn out by another scenario,
 * so that one cause routes here instead of to the next challenge.
 */
const teachThenOpenScenario = ({
  run,
  transcript,
  experience,
  contexts,
  onPartialAssistantMessage,
  deps,
}: {
  run: PersistedUnitRun;
  transcript: readonly ModelMessage[];
  experience: EducationExperienceDefinition;
  contexts: UnitAgentContexts;
  onPartialAssistantMessage?: (content: string) => void;
  deps: UnitTurnDependencies;
}): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const mentor = yield* deps.runMentorTeaching({
      messages: transcript,
      context: contexts.mentor,
      experience,
      createScenario: true,
      selectedResponse: selectedResponse(run),
      testedCriterionIds: run.unitContext.judgment.criteria.map(
        (criterion) => criterion.id,
      ),
      onPartialAssistantMessage,
    });
    if (!mentor.object.preparedScenario) {
      return yield* contractFailure("The mentor did not prepare the scenario.");
    }
    const challenge = yield* scenarioFromPresentation({
      run,
      presentation: mentor.object.preparedScenario,
    });
    const preparedRun = yield* attachPreparedScenario({
      run,
      challenge,
    }).pipe(asTurnError);
    const handoff = `${mentor.object.assistantMessage}\n\n`;
    const opened = yield* openScenario({
      run: preparedRun,
      experience,
      contexts,
      onPartialAssistantMessage: onPartialAssistantMessage
        ? (scenario) => onPartialAssistantMessage(`${handoff}${scenario}`)
        : undefined,
      deps,
    });
    return {
      ...opened,
      assistantMessage: `${handoff}${opened.assistantMessage}`,
    };
  });

export const runPassAdvanceTurn = (
  {
    run,
    interactionId,
    transcript,
    experience,
    contexts,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    interactionId: string;
    transcript: readonly ModelMessage[];
    experience: EducationExperienceDefinition;
    contexts: UnitAgentContexts;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    yield* assertInteractionId(run, interactionId).pipe(asTurnError);
    const step = run.cursor.step;
    if (step.kind !== "pass_result") {
      return yield* contractFailure("There is no result waiting to advance.");
    }
    return step.causeType === "never-learned-it" && !step.preparedScenario
      ? yield* teachThenOpenScenario({
          run,
          transcript,
          experience,
          contexts,
          onPartialAssistantMessage,
          deps,
        })
      : yield* openScenario({
          run,
          experience,
          contexts,
          onPartialAssistantMessage,
          deps,
        });
  });

export const runUnitTurn = (
  {
    run,
    interactionId,
    action,
    transcript,
    experience,
    contexts,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    interactionId: string;
    action?: WorkspaceTurnAction;
    transcript: readonly ModelMessage[];
    experience: EducationExperienceDefinition;
    contexts: UnitAgentContexts;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    yield* assertInteractionId(run, interactionId).pipe(asTurnError);
    const step = run.cursor.step;
    if (step.kind === "complete") {
      return yield* contractFailure("The education unit is already complete.");
    }
    if (step.kind === "pass_result") {
      return yield* contractFailure("Press Enter to continue after this pass.");
    }
    if (step.kind === "scenario") {
      return step.challenge
        ? yield* gradeScenario({
            run,
            transcript,
            experience,
            contexts,
            onPartialAssistantMessage,
            deps,
          })
        : yield* openScenario({
            run,
            experience,
            contexts,
            onPartialAssistantMessage,
            deps,
          });
    }

    if (action === "start_unit") {
      if (step.preparedScenario) {
        return yield* contractFailure(
          "The mentor has already opened this unit.",
        );
      }
      const mentor = yield* deps.runMentorTeaching({
        messages: [],
        context: contexts.mentor,
        experience,
        createScenario: false,
        selectedResponse: selectedResponse(run),
        testedCriterionIds: run.unitContext.judgment.criteria.map(
          (criterion) => criterion.id,
        ),
        onPartialAssistantMessage,
      });
      return {
        assistantMessage: mentor.object.assistantMessage,
        nextRun: yield* repeatTeaching(run).pipe(asTurnError),
        actor: "mentor" as const,
        reviewGrade: null,
        ratingWrite: null,
        presentedReviewChallenge: false,
      };
    }

    const learnerAnswer = latestUserText(transcript);
    if (!learnerAnswer) {
      return yield* contractFailure("Teaching requires the learner's answer.");
    }
    return yield* teachThenOpenScenario({
      run,
      transcript,
      experience,
      contexts,
      onPartialAssistantMessage,
      deps,
    });
  });
