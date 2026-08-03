import type { ModelMessage } from "ai";
import { Data, Effect } from "effect";

import type {
  EvaluationDimensionResult,
  UnitReviewChallenge,
} from "@acme/validators";

import type {
  ReviewGradeOutput,
  ReviewPresentationOutput,
} from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import { runMentorAgent } from "./mentor-agent";
import {
  runReviewGradeAgent,
  runReviewPresentationAgent,
} from "./review-agent";
import {
  completeCurrentCapabilityTodo,
  getCurrentCapabilityTodo,
  recordReviewChallenge,
  recordReviewGrade,
} from "./unit-state";

export class UnitTurnContractError extends Data.TaggedError(
  "UnitTurnContractError",
)<{ readonly message: string }> {}

/**
 * Two disjoint views of the same run, built by separate functions. There is no
 * audience flag to get wrong, so the mentor's view cannot reach the reviewer.
 */
export interface UnitContextBuilders {
  readonly forMentor: (run: PersistedUnitRun) => string;
  readonly forReviewer: (run: PersistedUnitRun) => string;
}

export interface UnitTurnResult {
  readonly assistantMessage: string;
  readonly nextRun: PersistedUnitRun;
  readonly actor: "mentor" | "reviewer";
  readonly completedCapabilityId: string | null;
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

const readContext = (
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

const latestUserText = (transcript: readonly ModelMessage[]): string | null => {
  const message = [...transcript]
    .reverse()
    .find((candidate) => candidate.role === "user");
  return message && typeof message.content === "string"
    ? message.content
    : null;
};

const exactIds = (actual: readonly string[], expected: readonly string[]) =>
  actual.length === expected.length &&
  new Set(actual).size === actual.length &&
  actual.every((id) => expected.includes(id));

const validateChallenge = ({
  challenge,
  run,
}: {
  challenge: UnitReviewChallenge;
  run: PersistedUnitRun;
}): Effect.Effect<UnitReviewChallenge, UnitTurnContractError> => {
  if (challenge.contract.runKind !== run.kind) {
    return contractFailure(
      `Review challenge run kind must be ${run.kind}, not ${challenge.contract.runKind}.`,
    );
  }
  const knownIds = run.masteryContract.dimensions.map(
    (dimension) => dimension.id,
  );
  const testedIds = challenge.contract.testedDimensions.map(
    (dimension) => dimension.dimensionId,
  );
  if (
    new Set(testedIds).size !== testedIds.length ||
    testedIds.some((id) => !knownIds.includes(id))
  ) {
    return contractFailure(
      "The review challenge must reference unique capability dimensions from the unit contract.",
    );
  }
  const expectedFormatId = run.difficultySnapshot?.format?.id;
  if (
    expectedFormatId &&
    challenge.difficultyVector.formatId !== expectedFormatId
  ) {
    return contractFailure(
      `Review challenge format must match Goldilocks (${expectedFormatId}).`,
    );
  }
  return Effect.succeed(challenge);
};

const validateGrade = ({
  output,
  run,
  learnerText,
}: {
  output: ReviewGradeOutput;
  run: PersistedUnitRun;
  learnerText: string;
}): Effect.Effect<number, UnitTurnContractError> => {
  const challenge = run.activeReviewChallenge;
  if (!challenge) {
    return contractFailure("The reviewer has no persisted challenge to grade.");
  }
  const expectedIds = challenge.contract.testedDimensions.map(
    (dimension) => dimension.dimensionId,
  );
  const actualIds = output.dimensionResults.map(
    (dimension) => dimension.dimensionId,
  );
  if (!exactIds(actualIds, expectedIds)) {
    return contractFailure(
      "Review grades must cover exactly the active challenge dimensions once.",
    );
  }
  const normalizedLearnerText = learnerText.toLocaleLowerCase();
  const citesOnlyLearnerEvidence = output.dimensionResults.every(
    (dimension) => {
      const quote = dimension.evidence
        .trim()
        .replace(/^["“”]+|["“”]+$/g, "")
        .toLocaleLowerCase();
      return quote.length >= 3 && normalizedLearnerText.includes(quote);
    },
  );
  if (!citesOnlyLearnerEvidence) {
    return contractFailure(
      "Every review dimension must cite an exact quote from the learner's latest answer.",
    );
  }
  const score = Math.round(
    output.dimensionResults.reduce(
      (total, dimension) => total + dimension.score,
      0,
    ) / output.dimensionResults.length,
  );
  if (score < 80 && output.errorCodes.length === 0) {
    return contractFailure("A sub-80 review grade requires an error code.");
  }
  if (score >= 80 && output.errorCodes.length > 0) {
    return contractFailure(
      "An 80+ review grade cannot carry failure error codes.",
    );
  }
  if (output.verdict === "pass") {
    if (!run.hasReviewGrade) {
      return contractFailure(
        "The first adversarial grade must push the learner through one further pressure test before passing.",
      );
    }
    const allCapabilityIds = run.masteryContract.dimensions.map(
      (dimension) => dimension.id,
    );
    if (!exactIds(actualIds, allCapabilityIds)) {
      return contractFailure(
        "The final adversarial pass must grade every unit capability.",
      );
    }
  }
  return Effect.succeed(score);
};

const challengeFromPresentation = (
  output: ReviewPresentationOutput,
): UnitReviewChallenge => ({
  prompt: output.assistantMessage,
  difficultyVector: output.difficultyVector,
  contract: output.contract,
});

const nextChallengeFromGrade = (
  output: ReviewGradeOutput,
): UnitReviewChallenge | null =>
  output.nextChallenge
    ? {
        prompt: output.assistantMessage,
        difficultyVector: output.nextChallenge.difficultyVector,
        contract: output.nextChallenge.contract,
      }
    : null;

const presentReview = ({
  run,
  transcript,
  experience,
  buildContext,
  onPartialAssistantMessage,
  deps,
}: {
  run: PersistedUnitRun;
  transcript: readonly ModelMessage[];
  experience: EducationExperienceDefinition;
  buildContext: UnitContextBuilders;
  onPartialAssistantMessage?: (content: string) => void;
  deps: UnitTurnDependencies;
}): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    const context = yield* readContext(buildContext.forReviewer, run);
    const result = yield* deps.runReviewPresentation({
      messages: transcript,
      context,
      experience,
      runKind: run.kind,
      onPartialAssistantMessage,
    });
    const challenge = yield* validateChallenge({
      challenge: challengeFromPresentation(result.object),
      run,
    });
    const nextRun = yield* recordReviewChallenge(run, challenge).pipe(
      Effect.mapError(
        (error) => new UnitTurnContractError({ message: error.message }),
      ),
    );
    return {
      assistantMessage: result.object.assistantMessage,
      nextRun,
      actor: "reviewer" as const,
      completedCapabilityId: null,
      reviewGrade: null,
      ratingWrite: null,
      presentedReviewChallenge: true,
    };
  });

export const runUnitTurn = (
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
    buildContext: UnitContextBuilders;
    onPartialAssistantMessage?: (content: string) => void;
  },
  deps: UnitTurnDependencies = LIVE_DEPENDENCIES,
): Effect.Effect<UnitTurnResult, UnitAgentError | UnitTurnContractError> =>
  Effect.gen(function* () {
    if (run.mode === "complete") {
      return yield* contractFailure("The education unit is already complete.");
    }

    if (run.mode === "learning") {
      const currentCapability = getCurrentCapabilityTodo(run);
      if (!currentCapability) {
        return yield* contractFailure(
          "The learning run has no pending capability todo.",
        );
      }
      const context = yield* readContext(buildContext.forMentor, run);
      const mentor = yield* deps.runMentor({
        messages: transcript,
        context,
        experience,
        currentCapabilityId: currentCapability.dimensionId,
        onPartialAssistantMessage,
      });
      const mentorMessage = mentor.object.assistantMessage;
      const completedCapabilityId = mentor.object.completedCapabilityId;
      if (!completedCapabilityId) {
        return {
          assistantMessage: mentorMessage,
          nextRun: run,
          actor: "mentor" as const,
          completedCapabilityId: null,
          reviewGrade: null,
          ratingWrite: null,
          presentedReviewChallenge: false,
        };
      }
      const advanced = yield* completeCurrentCapabilityTodo(
        run,
        completedCapabilityId,
      ).pipe(
        Effect.mapError(
          (error) => new UnitTurnContractError({ message: error.message }),
        ),
      );
      if (advanced.mode !== "review") {
        return {
          assistantMessage: mentorMessage,
          nextRun: advanced,
          actor: "mentor" as const,
          completedCapabilityId,
          reviewGrade: null,
          ratingWrite: null,
          presentedReviewChallenge: false,
        };
      }
      // The learner has already read the mentor's closing words. Continuing
      // that message with the reviewer's opening challenge — rather than
      // returning the challenge alone — keeps the committed reply an extension
      // of what was streamed, so the stream never retracts text it has shown.
      const handoff = `${mentorMessage}\n\n`;
      const review = yield* presentReview({
        run: advanced,
        transcript,
        experience,
        buildContext,
        onPartialAssistantMessage: onPartialAssistantMessage
          ? (challenge) => onPartialAssistantMessage(`${handoff}${challenge}`)
          : undefined,
        deps,
      });
      return {
        ...review,
        assistantMessage: `${handoff}${review.assistantMessage}`,
        completedCapabilityId,
      };
    }

    if (!run.activeReviewChallenge) {
      return yield* presentReview({
        run,
        transcript,
        experience,
        buildContext,
        onPartialAssistantMessage,
        deps,
      });
    }

    const context = yield* readContext(buildContext.forReviewer, run);
    const result = yield* deps.runReviewGrade({
      messages: transcript,
      context,
      activeChallenge: run.activeReviewChallenge,
      experience,
      onPartialAssistantMessage,
    });
    const learnerText = latestUserText(transcript);
    if (!learnerText) {
      return yield* contractFailure(
        "Adversarial grading requires the learner's latest answer.",
      );
    }
    const score = yield* validateGrade({
      output: result.object,
      run,
      learnerText,
    });
    const nextChallenge = nextChallengeFromGrade(result.object);
    if (nextChallenge) {
      yield* validateChallenge({
        challenge: nextChallenge,
        run,
      });
    }
    const nextRun = yield* recordReviewGrade({
      run,
      verdict: result.object.verdict,
      feedback: result.object.assistantMessage,
      nextChallenge,
    }).pipe(
      Effect.mapError(
        (error) => new UnitTurnContractError({ message: error.message }),
      ),
    );
    const passed = result.object.verdict === "pass";
    return {
      assistantMessage: result.object.assistantMessage,
      nextRun,
      actor: "reviewer" as const,
      completedCapabilityId: null,
      reviewGrade: {
        score,
        errorCodes: result.object.errorCodes,
        reasoning: result.object.gradeReasoning,
        dimensionResults: result.object.dimensionResults,
        passed,
      },
      ratingWrite: run.hasReviewGrade
        ? null
        : {
            score,
            errorCodes: result.object.errorCodes,
          },
      presentedReviewChallenge: nextChallenge !== null,
    };
  });
