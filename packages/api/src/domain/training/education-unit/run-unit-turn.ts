import type { ModelMessage } from "ai";
import { Effect, Exit } from "effect";

import type { EvaluationDimensionResult } from "@acme/validators";

import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import {
  compositeScore,
  hasModelGap,
  PASSING_COMPOSITE,
  PASSING_DIMENSION,
} from "./agent-contracts";
import { runMentorAgent } from "./mentor-agent";
import { prefillScenario, UnitTurnContractError } from "./prefill";
import {
  runReviewGradeAgent,
  runReviewPresentationAgent,
} from "./review-agent";
import {
  assertInteractionId,
  attachPreparedScenario,
  preparedScenario,
  presentScenario,
  repeatTeachback,
  settleScenario,
} from "./unit-state";

export interface UnitAgentContexts {
  readonly mentor: string;
  readonly critique: {
    readonly createChallenge: string;
    readonly judgeAnswer: string;
  };
}
export { UnitTurnContractError } from "./prefill";

export interface UnitTurnResult {
  readonly assistantMessage: string;
  readonly nextRun: PersistedUnitRun;
  readonly actor: "mentor" | "reviewer";
  readonly reviewGrade: {
    readonly score: number;
    readonly errorCodes: readonly string[];
    readonly reasoning: string;
    readonly dimensionResults: readonly EvaluationDimensionResult[];
    readonly passed: boolean;
  } | null;
  readonly ratingWrite: {
    readonly score: number;
    readonly errorCodes: readonly string[];
  } | null;
  readonly presentedReviewChallenge: boolean;
}

export interface UnitTurnDependencies {
  readonly runMentor: typeof runMentorAgent;
  readonly runReviewPresentation: typeof runReviewPresentationAgent;
  readonly runReviewGrade: typeof runReviewGradeAgent;
}

const LIVE_DEPENDENCIES: UnitTurnDependencies = {
  runMentor: runMentorAgent,
  runReviewPresentation: runReviewPresentationAgent,
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
    const challenge =
      preparedScenario(run) ??
      (yield* prefillScenario(
        {
          run,
          experience,
          context: contexts.critique.createChallenge,
          onPartialAssistantMessage,
        },
        deps,
      ));
    if (preparedScenario(run)) onPartialAssistantMessage?.(challenge.prompt);
    const nextRun = yield* presentScenario({ run, challenge }).pipe(
      asTurnError,
    );
    return {
      assistantMessage: challenge.prompt,
      nextRun,
      actor: "reviewer" as const,
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
      result.score < PASSING_DIMENSION
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
    const output = (yield* deps.runReviewGrade({
      messages: [{ role: "user", content: learnerAnswer }],
      context: contexts.critique.judgeAnswer,
      activeChallenge: step.challenge,
      experience,
      shape: {
        testedDimensionIds: step.challenge.contract.testedCriterionIds,
        learnerAnswer,
      },
      onPartialAssistantMessage,
    })).object;
    const evidenceIds = evidencedTargets(run, output.dimensionResults);
    const allTargetsEvidenced = run.unitContext.targets.every((target) =>
      evidenceIds.includes(target.id),
    );
    const gap = hasModelGap(output.dimensionResults) || !allTargetsEvidenced;
    const errorCodes = gap
      ? output.errorCodes.length > 0
        ? output.errorCodes
        : [
            ...output.dimensionResults
              .filter((dimension) => dimension.score < PASSING_COMPOSITE)
              .map((dimension) => `gap:${dimension.dimensionId}`),
            ...run.unitContext.targets
              .filter((target) => !evidenceIds.includes(target.id))
              .map((target) => `unevidenced:${target.id}`),
          ].slice(0, 3)
      : [];
    const score = compositeScore(output.dimensionResults);
    const nextRun = yield* settleScenario({
      run,
      passed: !gap,
      errorCodes,
      dimensionResults: output.dimensionResults,
      evidencedTargetIds: evidenceIds,
    }).pipe(asTurnError);
    return {
      assistantMessage: output.assistantMessage,
      nextRun,
      actor: "reviewer" as const,
      reviewGrade: {
        score,
        errorCodes,
        reasoning: output.scratchpad,
        dimensionResults: output.dimensionResults,
        passed: !gap,
      },
      ratingWrite: { score, errorCodes },
      presentedReviewChallenge: false,
    };
  });

export const runPassAdvanceTurn = (
  {
    run,
    interactionId,
    experience,
    contexts,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    interactionId: string;
    experience: EducationExperienceDefinition;
    contexts: UnitAgentContexts;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    yield* assertInteractionId(run, interactionId).pipe(asTurnError);
    if (run.cursor.step.kind !== "feedback") {
      return yield* contractFailure("There is no feedback waiting to advance.");
    }
    return yield* openScenario({
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
    if (step.kind === "complete") {
      return yield* contractFailure("The education unit is already complete.");
    }
    if (step.kind === "feedback") {
      return yield* contractFailure(
        "Press Enter to continue after the feedback.",
      );
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

    const learnerAnswer = latestUserText(transcript);
    if (!learnerAnswer) {
      return yield* contractFailure(
        "Teachback requires the learner's explanation.",
      );
    }
    const [mentor, scenarioExit] = yield* Effect.all(
      [
        deps.runMentor({
          messages: [{ role: "user", content: learnerAnswer }],
          context: contexts.mentor,
          experience,
          onPartialAssistantMessage,
        }),
        Effect.exit(
          preparedScenario(run)
            ? Effect.succeed(preparedScenario(run))
            : prefillScenario(
                {
                  run,
                  experience,
                  context: contexts.critique.createChallenge,
                },
                deps,
              ),
        ),
      ],
      { concurrency: 2 },
    );
    if (!mentor.object.teachbackPassed) {
      const preparedRun = preparedScenario(run)
        ? run
        : Exit.isSuccess(scenarioExit)
          ? scenarioExit.value
            ? yield* attachPreparedScenario({
                run,
                challenge: scenarioExit.value,
              }).pipe(asTurnError)
            : run
          : run;
      return {
        assistantMessage: mentor.object.assistantMessage,
        nextRun: yield* repeatTeachback(preparedRun).pipe(asTurnError),
        actor: "mentor" as const,
        reviewGrade: null,
        ratingWrite: null,
        presentedReviewChallenge: false,
      };
    }
    if (Exit.isFailure(scenarioExit)) {
      return yield* Effect.failCause(scenarioExit.cause);
    }
    const scenario = scenarioExit.value;
    if (!scenario) {
      return yield* contractFailure("The next scenario could not be prepared.");
    }
    const preparedRun = preparedScenario(run)
      ? run
      : yield* attachPreparedScenario({ run, challenge: scenario }).pipe(
          asTurnError,
        );
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
