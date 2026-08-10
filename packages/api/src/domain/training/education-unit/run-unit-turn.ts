import type { ModelMessage } from "ai";
import { Effect } from "effect";

import type {
  EvaluationDimensionResult,
  UnitReviewPass,
} from "@acme/validators";

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
  parkedChallenge,
  prefillScenario,
  UnitTurnContractError,
} from "./prefill";
import {
  runReviewGradeAgent,
  runReviewPresentationAgent,
} from "./review-agent";
import {
  attachChallenge,
  closeSolve,
  completeCurrentCapabilityTodo,
  currentTodo,
  isDecisivePass,
  markComplete,
  presentSolve,
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

const latestUserText = (transcript: readonly ModelMessage[]): string | null => {
  const message = [...transcript]
    .reverse()
    .find((candidate) => candidate.role === "user");
  return message && typeof message.content === "string"
    ? message.content
    : null;
};

/**
 * Opens the pending solve. A pre-generated challenge is replayed as-is; only an
 * empty slot costs a model call.
 */
const openSolve = ({
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
    const pending = currentTodo(run);
    if (pending?.kind !== "solve" || pending.status !== "pending") {
      return yield* contractFailure("There is no challenge to open.");
    }
    const challenge =
      pending.challenge ??
      (yield* prefillScenario(
        {
          run,
          experience,
          context: contexts.critique.createChallenge,
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

    const result = yield* deps.runReviewGrade({
      messages: [{ role: "user", content: learnerAnswer }],
      context: contexts.critique.judgeAnswer,
      activeChallenge,
      experience,
      shape: {
        testedDimensionIds: activeChallenge.contract.testedCriterionIds,
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
        reasoning: output.scratchpad,
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
    experience,
    contexts,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    experience: EducationExperienceDefinition;
    contexts: UnitAgentContexts;
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
      experience,
      contexts,
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
    contexts,
    onPartialAssistantMessage,
  }: {
    run: PersistedUnitRun;
    transcript: readonly ModelMessage[];
    experience: EducationExperienceDefinition;
    contexts: UnitAgentContexts;
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
      if (head.status === "presented") {
        return yield* gradeSolve({
          run,
          transcript,
          experience,
          contexts,
          onPartialAssistantMessage,
          deps,
        });
      }
      // A recall run pre-completes its teaching moves, so its first solve is
      // the head from the moment the run exists and nothing else can open it.
      // Only a later pass parks behind Enter, so pass 1 opens here.
      return head.pass === 1
        ? yield* openSolve({
            run,
            experience,
            contexts,
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

    // The teach step normally completes on its first message and hands straight
    // to the scenario, so authoring that scenario alongside the mentor rather
    // than after it takes a whole model call off the learner's wait. A miss is
    // not wasted: it is parked on the solve for whichever turn opens it. A
    // failure is swallowed, because a teach turn must not die for a scenario
    // that openSolve can still write live.
    const [mentor, speculative] = yield* Effect.all(
      [
        deps.runMentor({
          messages: transcript,
          context: contexts.mentor,
          experience,
          currentCapabilityId: head.dimensionId,
          onPartialAssistantMessage,
        }),
        parkedChallenge(run)
          ? Effect.succeed(null)
          : prefillScenario(
              {
                run,
                experience,
                context: contexts.critique.createChallenge,
              },
              deps,
            ).pipe(Effect.catch(() => Effect.succeed(null))),
      ],
      { concurrency: 2 },
    );
    const mentorMessage = mentor.object.assistantMessage;
    const completedCapabilityId = mentor.object.completedCapabilityId;
    const park = (target: PersistedUnitRun) =>
      speculative
        ? attachChallenge({ run: target, challenge: speculative }).pipe(
            asTurnError,
          )
        : Effect.succeed(target);
    if (!completedCapabilityId) {
      return {
        assistantMessage: mentorMessage,
        nextRun: yield* park(run),
        actor: "mentor" as const,
        completedCapabilityId: null,
        reviewGrade: null,
        ratingWrite: null,
        presentedReviewChallenge: false,
        settledPass: null,
      };
    }
    const advanced = yield* park(
      yield* completeCurrentCapabilityTodo(run, completedCapabilityId).pipe(
        asTurnError,
      ),
    );
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
      experience,
      contexts,
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
