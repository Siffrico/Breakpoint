import type { ModelMessage } from "ai";
import { Data, Effect } from "effect";

import type {
  DifficultyVector,
  EvaluationDimensionResult,
  ScenarioEvaluationContract,
  UnitReviewChallenge,
  UnitReviewPass,
} from "@acme/validators";

import type { ReviewPresentationOutput } from "./agent-contracts";
import type { UnitAgentError } from "./agent-errors";
import type { EducationExperienceDefinition } from "./experience";
import type { PersistedUnitRun } from "./unit-state";
import {
  compositeScore,
  hasModelGap,
  PASSING_COMPOSITE,
} from "./agent-contracts";
import { runMentorAgent } from "./mentor-agent";
import {
  runReviewGradeAgent,
  runReviewPresentationAgent,
} from "./review-agent";
import {
  closeSolve,
  completeCurrentCapabilityTodo,
  currentTodo,
  isDecisivePass,
  markComplete,
  presentSolve,
} from "./unit-state";

export class UnitTurnContractError extends Data.TaggedError(
  "UnitTurnContractError",
)<{ readonly message: string }> {}

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
  /** The pass this turn closed out, if it closed one. */
  readonly settledPass: UnitReviewPass | null;
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
});

const challengeFromPresentation = (
  run: PersistedUnitRun,
  output: ReviewPresentationOutput,
  difficultyVector: DifficultyVector,
): UnitReviewChallenge => ({
  prompt: output.assistantMessage,
  difficultyVector,
  contract: evaluationContractFor(run, output.assistantMessage),
});

const presentationContext = (
  context: string,
  difficultyVector: DifficultyVector,
): string => `${context}

## Exact structural target
Author the scenario to this server-owned target: ${JSON.stringify(difficultyVector)}. Return only the learner-facing scenario in assistantMessage.`;

/**
 * Writes one scenario for the run's pending solve. Used live and by
 * pre-generation, so both paths produce the same shape.
 */
export const authorChallenge = (
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
  deps: UnitTurnDependencies = LIVE_DEPENDENCIES,
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
    return challengeFromPresentation(run, result.object, difficultyVector);
  });

/**
 * Opens the pending solve. A pre-generated challenge is replayed as-is; only an
 * empty slot costs a model call.
 */
const openSolve = ({
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
    const pending = currentTodo(run);
    if (pending?.kind !== "solve" || pending.status !== "pending") {
      return yield* contractFailure("There is no challenge to open.");
    }
    const challenge =
      pending.challenge ??
      (yield* authorChallenge(
        {
          run,
          transcript,
          experience,
          buildContext,
          onPartialAssistantMessage,
        },
        deps,
      ));
    if (pending.challenge) {
      onPartialAssistantMessage?.(challenge.prompt);
    }
    const nextRun = yield* presentSolve({ run, challenge }).pipe(asTurnError);
    return {
      assistantMessage: challenge.prompt,
      nextRun,
      actor: "reviewer" as const,
      completedCapabilityId: null,
      reviewGrade: null,
      ratingWrite: null,
      presentedReviewChallenge: true,
      settledPass: null,
    };
  });

/**
 * Grades the answered solve and marks the pass. The mark is the only thing that
 * ends a unit; a non-decisive or failed mark appends the next pass.
 */
const gradeSolve = ({
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
    const activeChallenge = run.activeReviewChallenge;
    if (!activeChallenge) {
      return yield* contractFailure(
        "The critic has no presented challenge to grade.",
      );
    }
    const learnerAnswer = latestUserText(transcript);
    if (!learnerAnswer) {
      return yield* contractFailure(
        "Grading requires the learner's latest answer.",
      );
    }
    const decisive = isDecisivePass(run);
    const answered = yield* closeSolve(run).pipe(asTurnError);

    const context = yield* readContext(buildContext.forCritic, run);
    const result = yield* deps.runReviewGrade({
      messages: transcript,
      context,
      activeChallenge,
      experience,
      shape: {
        testedDimensionIds: activeChallenge.contract.testedDimensions.map(
          (dimension) => dimension.dimensionId,
        ),
        learnerAnswer,
        decisive,
      },
      onPartialAssistantMessage,
    });

    const output = result.object;
    const gap = hasModelGap(output.dimensionResults);
    const errorCodes = gap
      ? output.errorCodes.length > 0
        ? output.errorCodes
        : output.dimensionResults
            .filter((dimension) => dimension.score < PASSING_COMPOSITE)
            .map((dimension) => `gap:${dimension.dimensionId}`)
            .slice(0, 3)
      : [];
    const settledPass = answered.reviewPass;
    const nextRun = yield* markComplete({
      run: answered,
      result: gap ? "fail" : "pass",
      feedback: output.assistantMessage,
    }).pipe(asTurnError);

    const score = compositeScore(output.dimensionResults);
    return {
      assistantMessage: output.assistantMessage,
      nextRun,
      actor: "reviewer" as const,
      completedCapabilityId: null,
      reviewGrade: {
        score,
        errorCodes,
        reasoning: output.gradeReasoning,
        dimensionResults: output.dimensionResults,
        passed: !gap,
      },
      // Goldilocks reads only the marks that could end the unit.
      ratingWrite: decisive ? { score, errorCodes } : null,
      presentedReviewChallenge: false,
      settledPass,
    };
  });

/**
 * Enter opens the next pass's scenario. It carries no learner answer and never
 * completes the unit.
 */
export const runPassAdvanceTurn = (
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
    if (run.mode !== "awaiting_next_pass") {
      return yield* contractFailure("There is no next pass to open yet.");
    }
    return yield* openSolve({
      run,
      transcript,
      experience,
      buildContext,
      onPartialAssistantMessage,
      deps,
    });
  });

/**
 * One turn is one look at the head of the list: a teaching move belongs to the
 * mentor, everything from the solve onward belongs to the reviewer.
 */
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
    const head = currentTodo(run);
    if (!head) {
      return yield* contractFailure("The education unit is already complete.");
    }

    if (head.kind === "solve") {
      return head.status === "presented"
        ? yield* gradeSolve({
            run,
            transcript,
            experience,
            buildContext,
            onPartialAssistantMessage,
            deps,
          })
        : yield* contractFailure(
            "This challenge is finished. Press Enter to continue.",
          );
    }

    if (head.kind === "complete") {
      // Reachable only if a previous turn died between the answer and the mark.
      return yield* contractFailure(
        "This answer is still being marked. Try again in a moment.",
      );
    }

    const context = yield* readContext(buildContext.forMentor, run);
    const mentor = yield* deps.runMentor({
      messages: transcript,
      context,
      experience,
      currentCapabilityId: head.dimensionId,
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
        settledPass: null,
      };
    }
    const advanced = yield* completeCurrentCapabilityTodo(
      run,
      completedCapabilityId,
    ).pipe(asTurnError);
    if (currentTodo(advanced)?.kind === "capability") {
      return {
        assistantMessage: mentorMessage,
        nextRun: advanced,
        actor: "mentor" as const,
        completedCapabilityId,
        reviewGrade: null,
        ratingWrite: null,
        presentedReviewChallenge: false,
        settledPass: null,
      };
    }
    // The learner has already read the mentor's closing words. Continuing
    // that message with the critic's opening challenge — rather than
    // returning the challenge alone — keeps the committed reply an extension
    // of what was streamed, so the stream never retracts text it has shown.
    const handoff = `${mentorMessage}\n\n`;
    const opened = yield* openSolve({
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
      ...opened,
      assistantMessage: `${handoff}${opened.assistantMessage}`,
      completedCapabilityId,
    };
  });
