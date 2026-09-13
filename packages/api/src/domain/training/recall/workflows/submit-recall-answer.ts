import { randomUUID } from "node:crypto";
import { Clock, Effect } from "effect";

import type {
  RecallCorrectionRecord,
  RecallCriterionEvidence,
} from "@acme/validators";

import { RecallContractError, RecallModelError } from "../errors";
import { gradeRecallCorrection, gradeRecallRetrieval } from "../model";
import { RecallRepo } from "../recall-repo";
import {
  scheduleCorrectionComplete,
  scheduleRetrievalResult,
} from "../scheduling";
import { assertCriterionEvidence, transitionRecallTask } from "../state";

const validateEvidence = (
  criterionIds: readonly string[],
  evidence: readonly RecallCriterionEvidence[],
) =>
  Effect.try({
    try: () => {
      assertCriterionEvidence({
        criterionIds,
        evidenceIds: evidence.map((item) => item.criterionId),
      });
      return evidence.every((item) => item.passed);
    },
    catch: (cause) =>
      new RecallContractError({
        message: "The recall assessment did not match its assigned criteria.",
        cause,
      }),
  });

export const submitRecallAnswerWorkflow = (input: {
  readonly userId: string;
  readonly taskId: string;
  readonly interactionId: string;
  readonly requestId: string;
  readonly answer: string;
  readonly now: Date;
  readonly onPartialFeedback?: (content: string) => void;
}) =>
  Effect.gen(function* () {
    const repo = yield* RecallRepo;
    const leaseId = randomUUID();
    const claim = yield* repo.claimAnswer({ ...input, leaseId });
    if (claim.status === "committed") return claim.response;
    if (claim.status === "processing") {
      return yield* new RecallContractError({
        message: "This recall answer is already being evaluated.",
      });
    }

    const task = claim.task;
    const scenario = task.scenario;
    if (!scenario || !task.currentQuestion) {
      yield* repo.releaseAnswer({
        taskId: task.id,
        requestId: input.requestId,
        leaseId,
      });
      return yield* new RecallContractError({
        message: "This recall check is not ready for an answer.",
      });
    }
    const currentQuestion = task.currentQuestion;
    const criterionIds = task.knowledgeSnapshot.criteria.map(
      (criterion) => criterion.id,
    );

    const assessed = yield* Effect.gen(function* () {
      if (task.state === "retrieving") {
        const assessment = yield* gradeRecallRetrieval(
          {
            snapshot: task.knowledgeSnapshot,
            scenario,
            answer: input.answer,
          },
          input.onPartialFeedback,
        );
        return { kind: "retrieval" as const, assessment };
      }
      const assessment = yield* gradeRecallCorrection(
        {
          snapshot: task.knowledgeSnapshot,
          scenario,
          correctionQuestion: currentQuestion,
          answer: input.answer,
        },
        input.onPartialFeedback,
      );
      return { kind: "correction" as const, assessment };
    }).pipe(
      Effect.tapError((error) =>
        error instanceof RecallModelError
          ? repo.releaseAnswer({
              taskId: task.id,
              requestId: input.requestId,
              leaseId,
            })
          : Effect.void,
      ),
    );

    const passed = yield* validateEvidence(
      criterionIds,
      assessed.assessment.evidence,
    ).pipe(
      Effect.tapError(() =>
        repo.releaseAnswer({
          taskId: task.id,
          requestId: input.requestId,
          leaseId,
        }),
      ),
    );

    if (assessed.kind === "retrieval") {
      const { assessment } = assessed;
      if (
        passed !== (assessment.explanation === null) ||
        passed !== (assessment.correctionQuestion === null)
      ) {
        yield* repo.releaseAnswer({
          taskId: task.id,
          requestId: input.requestId,
          leaseId,
        });
        return yield* new RecallContractError({
          message: "The recall feedback contradicted its criterion evidence.",
        });
      }
      const schedule = scheduleRetrievalResult({
        strength: task.strengthAtReservation,
        passed,
        now: input.now,
      });
      const nextState = transitionRecallTask("retrieving", {
        type: "retrieval_graded",
        passed,
      }) as "correcting" | "complete";
      const nextInteractionId = passed ? null : randomUUID();
      const question = passed ? null : assessment.correctionQuestion;
      const response = {
        taskId: task.id,
        interactionId: nextInteractionId,
        state: nextState,
        feedback: passed
          ? assessment.feedback
          : `${assessment.feedback}\n\n${assessment.explanation}`,
        question,
        passed,
        canPause: !passed,
      };
      return yield* repo.commitAnswer({
        userId: input.userId,
        task,
        requestId: input.requestId,
        leaseId,
        answer: input.answer,
        response,
        nextState,
        nextInteractionId,
        currentQuestion: question,
        firstRetrieval: {
          requestId: input.requestId,
          interactionId: input.interactionId,
          answer: input.answer,
          feedback: assessment.feedback,
          explanation: assessment.explanation,
          correctionQuestion: assessment.correctionQuestion,
          evidence: assessment.evidence,
          passed,
          answeredAt: input.now.toISOString(),
          strengthBefore: task.strengthAtReservation,
          strengthAfter: schedule.strength,
        },
        correctionHistory: task.correctionHistory,
        schedule,
        now: input.now,
      });
    }

    const { assessment } = assessed;
    if (passed !== (assessment.nextQuestion === null)) {
      yield* repo.releaseAnswer({
        taskId: task.id,
        requestId: input.requestId,
        leaseId,
      });
      return yield* new RecallContractError({
        message: "The correction feedback contradicted its criterion evidence.",
      });
    }
    const completedAt = new Date(yield* Clock.currentTimeMillis);
    const nextState = transitionRecallTask("correcting", {
      type: "correction_graded",
      passed,
    }) as "correcting" | "complete";
    const nextInteractionId = passed ? null : randomUUID();
    const question = passed ? null : assessment.nextQuestion;
    const correction: RecallCorrectionRecord = {
      interactionId: input.interactionId,
      answer: input.answer,
      feedback: assessment.feedback,
      evidence: assessment.evidence,
      passed,
      question: currentQuestion,
      answeredAt: input.now,
    };
    const response = {
      taskId: task.id,
      interactionId: nextInteractionId,
      state: nextState,
      feedback: assessment.feedback,
      question,
      passed,
      canPause: !passed,
    };
    return yield* repo.commitAnswer({
      userId: input.userId,
      task,
      requestId: input.requestId,
      leaseId,
      answer: input.answer,
      response,
      nextState,
      nextInteractionId,
      currentQuestion: question,
      firstRetrieval: task.firstRetrieval,
      correctionHistory: [...task.correctionHistory, correction],
      schedule:
        passed && task.firstRetrieval
          ? scheduleCorrectionComplete({
              reducedStrength: task.firstRetrieval.strengthAfter,
              now: completedAt,
            })
          : null,
      now: completedAt,
    });
  });
