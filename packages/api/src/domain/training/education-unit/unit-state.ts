import { Data, Effect } from "effect";

import type {
  EducationExperienceSnapshot,
  UnitCapabilityTodo,
  UnitDifficultySnapshot,
  UnitMasteryContract,
  UnitReviewChallenge,
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

const capabilityTodosFor = (
  contract: UnitMasteryContract,
  status: UnitCapabilityTodo["status"],
) =>
  contract.dimensions.map(
    (dimension): UnitCapabilityTodo => ({ dimensionId: dimension.id, status }),
  );

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
  capabilityTodos: capabilityTodosFor(
    masteryContract,
    kind === "recall" ? "completed" : "pending",
  ),
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
  todoId: string,
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
  if (current.dimensionId !== todoId) {
    return contractFailure(
      `The mentor may only complete the current capability todo (${current.dimensionId}).`,
    );
  }

  const capabilityTodos = run.capabilityTodos.map((todo) =>
    todo.dimensionId === current.dimensionId
      ? ({ ...todo, status: "completed" } as const)
      : todo,
  );
  return Effect.succeed({
    ...run,
    capabilityTodos,
    mode: capabilityTodos.every((todo) => todo.status === "completed")
      ? "review"
      : "learning",
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

export const recordReviewGrade = ({
  run,
  verdict,
  feedback,
  nextChallenge,
}: {
  run: PersistedUnitRun;
  verdict: "continue" | "pass";
  feedback: string;
  nextChallenge: UnitReviewChallenge | null;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "review" || !run.activeReviewChallenge) {
    return contractFailure(
      "A review grade requires one persisted active challenge.",
    );
  }
  const reviewerFeedback = feedback.trim();
  if (reviewerFeedback.length < 12) {
    return contractFailure(
      "A review grade requires substantive learner-facing feedback.",
    );
  }
  if (verdict === "pass" && nextChallenge !== null) {
    return contractFailure(
      "A passed review cannot leave another challenge active.",
    );
  }
  if (verdict === "continue" && nextChallenge === null) {
    return contractFailure(
      "A continuing review must record the next adversarial challenge.",
    );
  }

  return Effect.succeed({
    ...run,
    mode: verdict === "pass" ? "complete" : "review",
    reviewerFeedback,
    hasReviewGrade: true,
    activeReviewChallenge: nextChallenge,
  });
};
