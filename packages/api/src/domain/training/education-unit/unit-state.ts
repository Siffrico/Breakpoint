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
  /** 1 repairs the model gap; 2 verifies the repair transfers unaided. */
  readonly reviewPass: UnitReviewPass;
  /** One targeted repair per pass; resets when Pass 2 is claimed. */
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
 * The gap is real, so the critic replaces the graded challenge with the one
 * compact exercise that repairs it. Still Pass 1 — the pass has now spent its
 * only repair, which is what makes a second one unrepresentable next turn.
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
  if (run.repairSpent) {
    return contractFailure(
      "This pass has already spent its one targeted repair.",
    );
  }
  return Effect.succeed({
    ...run,
    reviewerFeedback: feedback.trim(),
    repairSpent: true,
    activeReviewChallenge: exercise,
  });
};

/**
 * Nothing left to repair in this pass. Pass 1 of an education run parks in
 * `awaiting_pass2` for the learner's Enter; every other settle completes the
 * run. Recall runs are Pass 1 only — a spaced checkpoint verifies retrieval,
 * not transfer.
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
  const holdsForPass2 = run.kind === "education" && run.reviewPass === 1;
  return Effect.succeed({
    ...run,
    reviewerFeedback: feedback.trim(),
    activeReviewChallenge: null,
    mode: holdsForPass2 ? "awaiting_pass2" : "complete",
  });
};

/** Parks a backgrounded Pass-2 challenge on a run that is holding for Enter. */
export const recordPendingPass2Challenge = (
  run: PersistedUnitRun,
  challenge: UnitReviewChallenge,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "awaiting_pass2") {
    return contractFailure(
      "A pending Pass 2 challenge requires a settled Pass 1.",
    );
  }
  return Effect.succeed({ ...run, pendingPass2Challenge: challenge });
};

/**
 * The learner pressed Enter. Pass 2 opens with a fresh whole scenario and its
 * own repair budget; the unit never touched `complete`, so the Next Unit gate
 * stayed shut throughout.
 */
export const claimPass2 = ({
  run,
  challenge,
}: {
  run: PersistedUnitRun;
  challenge: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.mode !== "awaiting_pass2") {
    return contractFailure("Pass 2 requires a settled Pass 1.");
  }
  return Effect.succeed({
    ...run,
    mode: "review",
    reviewPass: 2,
    repairSpent: false,
    activeReviewChallenge: challenge,
    pendingPass2Challenge: null,
  });
};
