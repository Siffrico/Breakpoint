import { Data, Effect } from "effect";

import type {
  EducationExperienceSnapshot,
  UnitCapabilityTodo,
  UnitDifficultySnapshot,
  UnitMasteryContract,
  UnitReviewChallenge,
  UnitReviewPass,
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
  /** The current independent scenario pass. */
  readonly reviewPass: UnitReviewPass;
  /** Whether this pass's main scenario exposed a gap. */
  readonly repairSpent: boolean;
  readonly pendingPass2Challenge: UnitReviewChallenge | null;
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
  reviewPass: 1,
  repairSpent: false,
  pendingPass2Challenge: null,
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

const requireGradableRun = (run: PersistedUnitRun, feedback: string) => {
  if (run.mode !== "review" || !run.activeReviewChallenge) {
    return contractFailure(
      "A review grade requires one persisted active challenge.",
    );
  }
  if (feedback.trim().length < 12) {
    return contractFailure(
      "A review grade requires substantive learner-facing feedback.",
    );
  }
  return null;
};

/**
 * A gap replaces the active item with a targeted application. The reviewer may
 * repair again until the learner demonstrates the insight.
 */
export const recordTargetedExercise = ({
  run,
  feedback,
  exercise,
}: {
  run: PersistedUnitRun;
  feedback: string;
  exercise: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const invalid = requireGradableRun(run, feedback);
  if (invalid) return invalid;
  return Effect.succeed({
    ...run,
    reviewerFeedback: feedback.trim(),
    repairSpent: true,
    activeReviewChallenge: exercise,
  });
};

/**
 * A settled education pass waits for Enter. Pass 1 always earns Pass 2; later
 * passes finish only when their independent scenario had no gap.
 */
export const settleReviewPass = ({
  run,
  feedback,
}: {
  run: PersistedUnitRun;
  feedback: string;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const invalid = requireGradableRun(run, feedback);
  if (invalid) return invalid;
  const awaitsNextPass =
    run.kind === "education" && (run.reviewPass === 1 || run.repairSpent);
  return Effect.succeed({
    ...run,
    reviewerFeedback: feedback.trim(),
    activeReviewChallenge: null,
    mode: awaitsNextPass ? "awaiting_next_pass" : "complete",
  });
};

/** Legacy pre-generation support for a run waiting for its next pass. */
export const recordPendingPass2Challenge = (
  run: PersistedUnitRun,
  challenge: UnitReviewChallenge,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "awaiting_next_pass") {
    return contractFailure("A pending challenge requires a settled pass.");
  }
  return Effect.succeed({ ...run, pendingPass2Challenge: challenge });
};

/**
 * The learner pressed Enter. The next independent scenario opens without
 * completing the unit, regardless of how many passes preceded it.
 */
export const claimNextPass = ({
  run,
  challenge,
}: {
  run: PersistedUnitRun;
  challenge: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "awaiting_next_pass") {
    return contractFailure("The next pass requires a settled pass.");
  }
  return Effect.succeed({
    ...run,
    mode: "review",
    reviewPass: run.reviewPass + 1,
    repairSpent: false,
    activeReviewChallenge: challenge,
    pendingPass2Challenge: null,
  });
};
