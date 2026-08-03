import { Data, Effect } from "effect";

import type {
  EducationExperienceSnapshot,
  UnitCapabilityTodo,
  UnitDifficultySnapshot,
  UnitMasteryContract,
  UnitReviewChallenge,
  UnitReviewTodo,
  UnitRunKind,
  UnitRunMode,
} from "@acme/validators";
import { UnitMasteryContractSchema } from "@acme/validators";

import type { EducationExperienceDefinition } from "./experience";
import { snapshotEducationExperience } from "./experience";

export interface PersistedUnitRun {
  readonly unitId: string;
  readonly sessionId: string;
  readonly userId: string | null;
  readonly kind: UnitRunKind;
  readonly mode: UnitRunMode;
  readonly experience: EducationExperienceSnapshot;
  readonly masteryContract: UnitMasteryContract;
  readonly capabilityTodos: readonly UnitCapabilityTodo[];
  readonly reviewTodos: readonly UnitReviewTodo[];
  readonly activeReviewChallenge: UnitReviewChallenge | null;
  readonly reviewerFeedback: string | null;
  readonly hasReviewGrade: boolean;
  readonly difficultySnapshot: UnitDifficultySnapshot | null;
}

export class UnitStateContractError extends Data.TaggedError(
  "UnitStateContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitStateContractError({ message }));

const pendingCapabilityTodos = (contract: UnitMasteryContract) =>
  contract.dimensions.map(
    (dimension): UnitCapabilityTodo => ({
      dimensionId: dimension.id,
      status: "pending",
      evidence: null,
    }),
  );

const completedCapabilityTodos = (contract: UnitMasteryContract) =>
  contract.dimensions.map(
    (dimension): UnitCapabilityTodo => ({
      dimensionId: dimension.id,
      status: "completed",
      evidence: "Previously verified capability selected for recall.",
    }),
  );

const pendingReviewTodos = (
  experience: EducationExperienceDefinition,
): UnitReviewTodo[] =>
  experience.reviewer.todos.map((todo) => ({
    todoId: todo.id,
    status: "pending",
    evidence: null,
  }));

export const createUnitRun = ({
  unitId,
  sessionId,
  userId,
  kind,
  masteryContract,
  experience,
}: {
  unitId: string;
  sessionId: string;
  userId?: string | null;
  kind: UnitRunKind;
  masteryContract: UnitMasteryContract;
  experience: EducationExperienceDefinition;
}): PersistedUnitRun => ({
  unitId,
  sessionId,
  userId: userId ?? null,
  kind,
  mode: kind === "recall" ? "review" : "learning",
  experience: snapshotEducationExperience(experience),
  masteryContract: UnitMasteryContractSchema.parse(masteryContract),
  capabilityTodos:
    kind === "recall"
      ? completedCapabilityTodos(masteryContract)
      : pendingCapabilityTodos(masteryContract),
  reviewTodos: pendingReviewTodos(experience),
  activeReviewChallenge: null,
  reviewerFeedback: null,
  hasReviewGrade: false,
  difficultySnapshot: null,
});

export const getCurrentCapabilityTodo = (
  run: Pick<PersistedUnitRun, "capabilityTodos">,
): UnitCapabilityTodo | null =>
  run.capabilityTodos.find((todo) => todo.status === "pending") ?? null;

export const completeCurrentCapabilityTodo = (
  run: PersistedUnitRun,
  update: { readonly todoId: string; readonly evidence: string },
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "learning") {
    return contractFailure(
      "Capability todos can only advance in learning mode.",
    );
  }
  const current = getCurrentCapabilityTodo(run);
  if (!current) {
    return contractFailure("The learning run has no pending capability todo.");
  }
  if (current.dimensionId !== update.todoId) {
    return contractFailure(
      `The mentor may only complete the current capability todo (${current.dimensionId}).`,
    );
  }
  const evidence = update.evidence.trim();
  if (evidence.length < 12) {
    return contractFailure(
      "Capability completion requires specific learner evidence.",
    );
  }

  const capabilityTodos = run.capabilityTodos.map((todo) =>
    todo.dimensionId === current.dimensionId
      ? ({ ...todo, status: "completed", evidence } as const)
      : todo,
  );
  const allComplete = capabilityTodos.every(
    (todo) => todo.status === "completed",
  );
  return Effect.succeed({
    ...run,
    capabilityTodos,
    mode: allComplete ? "review" : "learning",
  });
};

export const recordReviewChallenge = (
  run: PersistedUnitRun,
  challenge: UnitReviewChallenge,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "review") {
    return contractFailure("A review challenge requires review mode.");
  }
  if (run.activeReviewChallenge) {
    return contractFailure(
      "The active review challenge must be graded before another is recorded.",
    );
  }
  return Effect.succeed({ ...run, activeReviewChallenge: challenge });
};

const mergeReviewTodoEvidence = (
  run: PersistedUnitRun,
  updates: readonly { todoId: string; evidence: string }[],
): Effect.Effect<readonly UnitReviewTodo[], UnitStateContractError> => {
  const knownIds = new Set(run.reviewTodos.map((todo) => todo.todoId));
  const updateIds = new Set<string>();
  for (const update of updates) {
    if (!knownIds.has(update.todoId)) {
      return contractFailure(`Unknown review todo: ${update.todoId}.`);
    }
    if (updateIds.has(update.todoId)) {
      return contractFailure(`Duplicate review todo update: ${update.todoId}.`);
    }
    if (update.evidence.trim().length < 12) {
      return contractFailure(
        `Review todo ${update.todoId} requires specific evidence.`,
      );
    }
    updateIds.add(update.todoId);
  }

  const evidenceById = new Map(
    updates.map((update) => [update.todoId, update.evidence.trim()] as const),
  );
  return Effect.succeed(
    run.reviewTodos.map((todo) => {
      const evidence = evidenceById.get(todo.todoId);
      return evidence
        ? ({ ...todo, status: "completed", evidence } as const)
        : todo;
    }),
  );
};

export const recordReviewGrade = ({
  run,
  verdict,
  feedback,
  completedTodos,
  nextChallenge,
}: {
  run: PersistedUnitRun;
  verdict: "continue" | "pass";
  feedback: string;
  completedTodos: readonly { todoId: string; evidence: string }[];
  nextChallenge: UnitReviewChallenge | null;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> =>
  Effect.gen(function* () {
    if (run.mode !== "review" || !run.activeReviewChallenge) {
      return yield* contractFailure(
        "A review grade requires one persisted active challenge.",
      );
    }
    const reviewerFeedback = feedback.trim();
    if (reviewerFeedback.length < 12) {
      return yield* contractFailure(
        "A review grade requires substantive learner-facing feedback.",
      );
    }
    const reviewTodos = yield* mergeReviewTodoEvidence(run, completedTodos);
    const allReviewTodosComplete = reviewTodos.every(
      (todo) => todo.status === "completed",
    );

    if (verdict === "pass" && !allReviewTodosComplete) {
      return yield* contractFailure(
        "The reviewer cannot pass the unit before completing every review todo.",
      );
    }
    if (verdict === "pass" && nextChallenge !== null) {
      return yield* contractFailure(
        "A passed review cannot leave another challenge active.",
      );
    }
    if (verdict === "continue" && nextChallenge === null) {
      return yield* contractFailure(
        "A continuing review must record the next adversarial challenge.",
      );
    }

    return {
      ...run,
      mode: verdict === "pass" ? "complete" : "review",
      reviewTodos,
      reviewerFeedback,
      hasReviewGrade: true,
      activeReviewChallenge: nextChallenge,
    };
  });
