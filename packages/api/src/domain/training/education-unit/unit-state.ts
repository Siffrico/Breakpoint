import { randomUUID } from "node:crypto";
import { Data, Effect } from "effect";

import type {
  EducationExperienceSnapshot,
  EvaluationDimensionResult,
  UnitContext,
  UnitCursor,
  UnitDiagnosisCause,
  UnitDifficultySnapshot,
  UnitReviewChallenge,
  UnitReviewPass,
  UnitRunKind,
  UnitRunMode,
} from "@acme/validators";
import { UnitContextSchema, UnitCursorSchema } from "@acme/validators";

import type { EducationExperienceDefinition } from "./experience";
import { snapshotEducationExperience } from "./experience";

export interface PersistedUnitRun {
  readonly unitId: string;
  readonly sessionId: string;
  readonly userId: string | null;
  readonly kind: UnitRunKind;
  readonly experience: EducationExperienceSnapshot;
  readonly unitContext: UnitContext;
  readonly cursor: UnitCursor;
  readonly difficultySnapshot: UnitDifficultySnapshot | null;
  readonly mode: UnitRunMode;
  readonly reviewPass: UnitReviewPass;
  readonly activeReviewChallenge: UnitReviewChallenge | null;
}

export class UnitStateContractError extends Data.TaggedError(
  "UnitStateContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitStateContractError({ message }));

const modeFor = (cursor: UnitCursor): UnitRunMode => {
  switch (cursor.step.kind) {
    case "teaching":
      return "learning";
    case "scenario":
      return "review";
    case "pass_result":
      return "awaiting_next_pass";
    case "complete":
      return "complete";
  }
};

const attemptFor = (cursor: UnitCursor): UnitReviewPass =>
  cursor.step.kind === "teaching" ? 1 : cursor.step.attempt;

const activeChallengeFor = (cursor: UnitCursor) =>
  cursor.step.kind === "scenario" ? cursor.step.challenge : null;

export const projectUnitRun = (
  run: Omit<PersistedUnitRun, "mode" | "reviewPass" | "activeReviewChallenge">,
): PersistedUnitRun => {
  const cursor = UnitCursorSchema.parse(run.cursor);
  return {
    ...run,
    cursor,
    mode: modeFor(cursor),
    reviewPass: attemptFor(cursor),
    activeReviewChallenge: activeChallengeFor(cursor),
  };
};

const initialInteractionId = ({
  kind,
  sessionId,
  unitId,
}: {
  kind: UnitRunKind;
  sessionId: string;
  unitId: string;
}) => `${kind}:${sessionId}:${unitId}:initial`;

export const isUnitUnopened = (run: PersistedUnitRun): boolean =>
  run.cursor.step.kind === "teaching" &&
  run.cursor.interactionId ===
    initialInteractionId({
      kind: run.kind,
      sessionId: run.sessionId,
      unitId: run.unitId,
    });

export const createUnitRun = ({
  unitId,
  sessionId,
  userId,
  kind,
  unitContext,
  experience,
}: {
  unitId: string;
  sessionId: string;
  userId?: string | null;
  kind: UnitRunKind;
  unitContext: UnitContext;
  experience: EducationExperienceDefinition;
}): PersistedUnitRun =>
  projectUnitRun({
    unitId,
    sessionId,
    userId: userId ?? null,
    kind,
    experience: snapshotEducationExperience(experience),
    unitContext: UnitContextSchema.parse(unitContext),
    cursor: {
      interactionId: initialInteractionId({ kind, sessionId, unitId }),
      scenarioPrompts: [],
      errorCodeHistory: [],
      step:
        kind === "education"
          ? { kind: "teaching", preparedScenario: null }
          : { kind: "scenario", attempt: 1, challenge: null },
    },
    difficultySnapshot: null,
  });

const replaceCursor = (
  run: PersistedUnitRun,
  cursor: UnitCursor,
): PersistedUnitRun => projectUnitRun({ ...run, cursor });

export const assertInteractionId = (
  run: PersistedUnitRun,
  interactionId: string,
): Effect.Effect<void, UnitStateContractError> =>
  run.cursor.interactionId === interactionId
    ? Effect.void
    : contractFailure(
        "This response belongs to a learning interaction that is no longer active.",
      );

export const preparedScenario = (
  run: PersistedUnitRun,
): UnitReviewChallenge | null => {
  const step = run.cursor.step;
  return step.kind === "teaching" || step.kind === "pass_result"
    ? step.preparedScenario
    : step.kind === "scenario"
      ? step.challenge
      : null;
};

export const isRatingEligibleScenario = (run: PersistedUnitRun): boolean => {
  const step = run.cursor.step;
  return (
    step.kind === "scenario" && step.challenge !== null && step.attempt >= 2
  );
};

export const attachPreparedScenario = ({
  run,
  challenge,
}: {
  run: PersistedUnitRun;
  challenge: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const step = run.cursor.step;
  if (step.kind !== "teaching" && step.kind !== "pass_result") {
    return contractFailure("There is no unopened scenario to prepare.");
  }
  if (step.preparedScenario) {
    return contractFailure("The next scenario is already prepared.");
  }
  return Effect.succeed(
    replaceCursor(run, {
      ...run.cursor,
      step: { ...step, preparedScenario: challenge },
    }),
  );
};

export const repeatTeaching = (
  run: PersistedUnitRun,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  if (run.cursor.step.kind !== "teaching") {
    return contractFailure("This unit is not waiting for the teaching check.");
  }
  return Effect.succeed(
    replaceCursor(run, {
      ...run.cursor,
      interactionId: randomUUID(),
      preparedOpening: undefined,
    }),
  );
};

export const presentScenario = ({
  run,
  challenge,
}: {
  run: PersistedUnitRun;
  challenge: UnitReviewChallenge;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const step = run.cursor.step;
  const expectedCriteria = run.unitContext.judgment.criteria.map(
    (criterion) => criterion.id,
  );
  const testedCriteria = challenge.contract.testedCriterionIds;
  if (
    challenge.contract.runKind !== run.kind ||
    testedCriteria.length !== expectedCriteria.length ||
    new Set(testedCriteria).size !== testedCriteria.length ||
    expectedCriteria.some(
      (criterionId) => !testedCriteria.includes(criterionId),
    )
  ) {
    return contractFailure(
      "The scenario does not test the complete contract for this run.",
    );
  }
  const attempt =
    step.kind === "teaching"
      ? 1
      : step.kind === "pass_result"
        ? step.attempt + 1
        : step.kind === "scenario" && step.challenge === null
          ? step.attempt
          : null;
  if (attempt === null) {
    return contractFailure("There is no scenario waiting to be presented.");
  }
  return Effect.succeed(
    replaceCursor(run, {
      ...run.cursor,
      interactionId: randomUUID(),
      scenarioPrompts: [...run.cursor.scenarioPrompts, challenge.prompt],
      step: { kind: "scenario", attempt, challenge },
    }),
  );
};

export const settleScenario = ({
  run,
  passed,
  errorCodes,
  causeType,
  hypothesis,
  dimensionResults,
  evidencedTargetIds,
}: {
  run: PersistedUnitRun;
  passed: boolean;
  errorCodes: readonly string[];
  causeType: UnitDiagnosisCause | null;
  hypothesis: string | null;
  dimensionResults: readonly EvaluationDimensionResult[];
  evidencedTargetIds: readonly string[];
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const step = run.cursor.step;
  if (step.kind !== "scenario" || !step.challenge) {
    return contractFailure("There is no presented scenario to grade.");
  }
  if (!passed && errorCodes.length === 0) {
    return contractFailure(
      "A failed scenario requires a diagnostic error code.",
    );
  }
  const expectedTargetIds = run.unitContext.targets.map((target) => target.id);
  if (
    passed &&
    (evidencedTargetIds.length !== expectedTargetIds.length ||
      new Set(evidencedTargetIds).size !== evidencedTargetIds.length ||
      expectedTargetIds.some(
        (targetId) => !evidencedTargetIds.includes(targetId),
      ))
  ) {
    return contractFailure(
      "A passing scenario must evidence every target in the unit contract.",
    );
  }
  const nextStep: UnitCursor["step"] =
    passed && step.attempt >= 2
      ? {
          kind: "complete",
          attempt: step.attempt,
          outcome: "pass",
          evidence: [...dimensionResults],
          evidencedTargetIds: [...evidencedTargetIds],
        }
      : {
          kind: "pass_result",
          attempt: step.attempt,
          outcome: passed ? "pass" : "fail",
          errorCodes: passed ? [] : [...errorCodes],
          causeType: passed ? null : causeType,
          hypothesis: passed ? null : hypothesis,
          evidence: [...dimensionResults],
          evidencedTargetIds: [...evidencedTargetIds],
          preparedScenario: null,
        };
  return Effect.succeed(
    replaceCursor(run, {
      ...run.cursor,
      interactionId: randomUUID(),
      // Codes accumulate across the whole run so the critic can reuse the name
      // it already gave a mistake instead of coining a synonym for it.
      errorCodeHistory: [
        ...new Set([...run.cursor.errorCodeHistory, ...errorCodes]),
      ].slice(-24),
      step: nextStep,
    }),
  );
};

export const retireRun = (run: PersistedUnitRun): PersistedUnitRun =>
  replaceCursor(run, {
    ...run.cursor,
    interactionId: randomUUID(),
    step: {
      kind: "complete",
      attempt: attemptFor(run.cursor),
      outcome: "retired",
      evidence: [],
      evidencedTargetIds: [],
    },
  });
