import { randomUUID } from "node:crypto";
import { Data, Effect } from "effect";

import type {
  EducationExperienceSnapshot,
  UnitContext,
  UnitCursor,
  UnitDifficultySnapshot,
  UnitPart,
  UnitPartDraft,
  UnitPartResult,
  UnitPreparedStep,
  UnitReviewChallenge,
  UnitRoundSpec,
  UnitRunKind,
  UnitRunMode,
  DifficultyVector,
} from "@acme/validators";
import { UnitContextSchema, UnitCursorSchema } from "@acme/validators";

import type { EducationExperienceDefinition } from "./experience";
import type { UnitMove, UnitRoundStep } from "./unit-policy";
import { snapshotEducationExperience } from "./experience";
import {
  findLastRound,
  isRoundStep,
  nextMove,
  uncoveredCriterionIds,
} from "./unit-policy";

export interface PersistedUnitRun {
  readonly unitId: string;
  readonly sessionId: string;
  readonly userId: string | null;
  readonly kind: UnitRunKind;
  readonly experience: EducationExperienceSnapshot;
  readonly unitContext: UnitContext;
  readonly cursor: UnitCursor;
  readonly difficultySnapshot: UnitDifficultySnapshot | null;
  /** Derived from the cursor on every projection. */
  readonly mode: UnitRunMode;
  /** Derived: how many rounds the unit has opened, at least 1. */
  readonly roundNumber: number;
}

export class UnitStateContractError extends Data.TaggedError(
  "UnitStateContractError",
)<{ readonly message: string }> {}

const contractFailure = (message: string) =>
  Effect.fail(new UnitStateContractError({ message }));

// ---------------------------------------------------------------------------
// Views: everything here is read off the history, never stored.
// ---------------------------------------------------------------------------

/** What the unit needs from the learner before it can do anything else. */
export type UnitWait = "start" | "explanation" | "answer" | "continue" | "done";

export const waitingFor = (cursor: UnitCursor): UnitWait => {
  if (cursor.outcome) return "done";
  const lastStep = cursor.steps.at(-1);
  if (!lastStep) return "start";
  if (lastStep.kind === "teach") {
    return lastStep.explanation === null ? "explanation" : "continue";
  }
  return lastStep.parts.some((part) => part.result === null)
    ? "answer"
    : "continue";
};

const modeFor = (cursor: UnitCursor): UnitRunMode => {
  switch (waitingFor(cursor)) {
    case "start":
    case "explanation":
      return "teach";
    case "answer":
      return "answer";
    case "continue":
      return "feedback";
    case "done":
      return "complete";
  }
};

/** The round the learner is in, or null while they are in a lesson. */
export const activeRound = (cursor: UnitCursor): UnitRoundStep | null => {
  const lastStep = cursor.steps.at(-1);
  return isRoundStep(lastStep) ? lastStep : null;
};

/** The parts on the board that the learner has not answered yet. */
export const openParts = (cursor: UnitCursor): UnitPart[] =>
  activeRound(cursor)?.parts.filter((part) => part.result === null) ?? [];

export const unitCriterionIds = (run: Pick<PersistedUnitRun, "unitContext">) =>
  run.unitContext.judgment.criteria.map((criterion) => criterion.id);

export const nextUnitMove = (run: PersistedUnitRun): UnitMove =>
  nextMove(run.cursor.steps, unitCriterionIds(run));

/**
 * The unit's steps as a checklist, oldest first: what the learner has done and
 * where they are. Parts a round has not written yet show as `pending`.
 */
export type UnitProgressStep =
  | { kind: "teach"; current: boolean }
  | {
      kind: "round";
      label: "learn" | "exam";
      current: boolean;
      parts: ("met" | "missed" | "open" | "pending")[];
    };

export const projectUnitProgress = (cursor: UnitCursor): UnitProgressStep[] =>
  cursor.steps.map((step, index): UnitProgressStep => {
    const current = !cursor.outcome && index === cursor.steps.length - 1;
    if (step.kind === "teach") return { kind: "teach", current };
    const parts = step.parts.map((part) =>
      part.result === null
        ? ("open" as const)
        : part.result.met
          ? ("met" as const)
          : ("missed" as const),
    );
    return {
      kind: "round",
      label: step.spec.label,
      current,
      parts: [
        ...parts,
        ...Array.from(
          { length: step.spec.partCount - parts.length },
          () => "pending" as const,
        ),
      ],
    };
  });

export const partLetter = (index: number): string =>
  String.fromCharCode("a".charCodeAt(0) + index);

export const projectUnitRun = (
  run: Omit<PersistedUnitRun, "mode" | "roundNumber">,
): PersistedUnitRun => {
  const cursor = UnitCursorSchema.parse(run.cursor);
  return {
    ...run,
    cursor,
    mode: modeFor(cursor),
    roundNumber: Math.max(1, cursor.steps.filter(isRoundStep).length),
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
  run.cursor.steps.length === 0;

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
      steps: [],
      outcome: null,
      errorCodeHistory: [],
      prepared: null,
    },
    difficultySnapshot: null,
  });

/**
 * The rated round on the board, in the shape the rating attempt stores. Null
 * unless the learner is answering a rated round.
 */
export const ratedRoundChallenge = (
  run: PersistedUnitRun,
  prompt: string,
): UnitReviewChallenge | null => {
  const round = activeRound(run.cursor);
  if (!round?.spec.rated || waitingFor(run.cursor) !== "answer") return null;
  return {
    prompt,
    difficultyVector: round.difficultyVector,
    contract: {
      version: 1,
      runKind: run.kind,
      scenarioPromptSummary: round.narrative,
      testedCriterionIds: round.spec.criterionIds,
    },
  };
};

/** Targets whose skill the unit's final round showed. Empty before it ends. */
export const evidencedTargetIds = (run: PersistedUnitRun): string[] => {
  const round = findLastRound(run.cursor.steps);
  if (!run.cursor.outcome || !round) return [];
  const metCriteria = new Set(
    round.parts.flatMap(
      (part) =>
        part.result?.criterionResults
          .filter((result) => result.met)
          .map((result) => result.dimensionId) ?? [],
    ),
  );
  const shownSkills = new Set(
    run.unitContext.judgment.criteria
      .filter((criterion) => metCriteria.has(criterion.id))
      .flatMap((criterion) => criterion.skills),
  );
  return run.unitContext.targets
    .filter((target) => shownSkills.has(target.skill))
    .map((target) => target.id);
};

// ---------------------------------------------------------------------------
// Facts: each function appends one thing that happened. Every append rotates
// the interactionId, which also retires any prepared step.
// ---------------------------------------------------------------------------

const withCursor = (
  run: PersistedUnitRun,
  cursor: Omit<UnitCursor, "interactionId" | "prepared">,
): PersistedUnitRun =>
  projectUnitRun({
    ...run,
    cursor: { ...cursor, interactionId: randomUUID(), prepared: null },
  });

export const assertInteractionId = (
  run: PersistedUnitRun,
  interactionId: string,
): Effect.Effect<void, UnitStateContractError> =>
  run.cursor.interactionId === interactionId
    ? Effect.void
    : contractFailure(
        "This response belongs to a learning interaction that is no longer active.",
      );

const requireMove = (
  run: PersistedUnitRun,
  kind: UnitMove["kind"],
): Effect.Effect<UnitMove, UnitStateContractError> => {
  const wait = waitingFor(run.cursor);
  if (wait !== "start" && wait !== "continue") {
    return contractFailure("The unit is waiting on the learner.");
  }
  const move = nextUnitMove(run);
  return move.kind === kind
    ? Effect.succeed(move)
    : contractFailure(`The unit's next move is ${move.kind}, not ${kind}.`);
};

export const recordLesson = (
  run: PersistedUnitRun,
  lesson: string,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> =>
  requireMove(run, "teach").pipe(
    Effect.as(
      withCursor(run, {
        ...run.cursor,
        steps: [
          ...run.cursor.steps,
          { kind: "teach", lesson, explanation: null },
        ],
      }),
    ),
  );

export const recordExplanation = (
  run: PersistedUnitRun,
  explanation: string,
): Effect.Effect<PersistedUnitRun, UnitStateContractError> => {
  const lastStep = run.cursor.steps.at(-1);
  if (waitingFor(run.cursor) !== "explanation" || lastStep?.kind !== "teach") {
    return contractFailure("The unit is not waiting for an explanation.");
  }
  return Effect.succeed(
    withCursor(run, {
      ...run.cursor,
      steps: [...run.cursor.steps.slice(0, -1), { ...lastStep, explanation }],
    }),
  );
};

const checkPartCriteria = (
  spec: UnitRoundSpec,
  parts: readonly UnitPartDraft[],
): string | null =>
  parts.some((part) =>
    part.criterionIds.some((id) => !spec.criterionIds.includes(id)),
  )
    ? "A part tests a criterion outside its round."
    : null;

const present = (parts: readonly UnitPartDraft[], presentedAt: Date) =>
  parts.map(
    (part): UnitPart => ({
      ...part,
      presentedAt: presentedAt.toISOString(),
      result: null,
    }),
  );

export const recordRoundOpened = ({
  run,
  spec,
  narrative,
  difficultyVector,
  parts,
  presentedAt,
}: {
  run: PersistedUnitRun;
  spec: UnitRoundSpec;
  narrative: string;
  difficultyVector: DifficultyVector;
  parts: readonly UnitPartDraft[];
  presentedAt: Date;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> =>
  Effect.gen(function* () {
    const move = yield* requireMove(run, "open_round");
    if (
      move.kind !== "open_round" ||
      JSON.stringify(move.spec) !== JSON.stringify(spec)
    ) {
      return yield* contractFailure("The round does not match the unit policy.");
    }
    const expectedParts = spec.pacing === "all_at_once" ? spec.partCount : 1;
    if (parts.length !== expectedParts) {
      return yield* contractFailure(
        `This round opens with ${expectedParts} part(s), not ${parts.length}.`,
      );
    }
    const criteriaIssue = checkPartCriteria(spec, parts);
    if (criteriaIssue) return yield* contractFailure(criteriaIssue);
    const round: UnitRoundStep = {
      kind: "round",
      spec,
      narrative,
      difficultyVector,
      parts: present(parts, presentedAt),
    };
    if (
      spec.pacing === "all_at_once" &&
      uncoveredCriterionIds(round).length > 0
    ) {
      return yield* contractFailure(
        "The round's parts do not test every criterion.",
      );
    }
    return withCursor(run, {
      ...run.cursor,
      steps: [...run.cursor.steps, round],
    });
  });

export const recordPartAdded = ({
  run,
  part,
  presentedAt,
}: {
  run: PersistedUnitRun;
  part: UnitPartDraft;
  presentedAt: Date;
}): Effect.Effect<PersistedUnitRun, UnitStateContractError> =>
  Effect.gen(function* () {
    yield* requireMove(run, "next_part");
    const round = activeRound(run.cursor);
    if (!round) return yield* contractFailure("There is no round to extend.");
    const criteriaIssue = checkPartCriteria(round.spec, [part]);
    if (criteriaIssue) return yield* contractFailure(criteriaIssue);
    const extended: UnitRoundStep = {
      ...round,
      parts: [...round.parts, ...present([part], presentedAt)],
    };
    if (
      extended.parts.length === round.spec.partCount &&
      uncoveredCriterionIds(extended).length > 0
    ) {
      return yield* contractFailure(
        "The round's last part must test every criterion still untested.",
      );
    }
    return withCursor(run, {
      ...run.cursor,
      steps: [...run.cursor.steps.slice(0, -1), extended],
    });
  });

/**
 * Grades the open parts, in board order. When the grade decides the unit, the
 * outcome is written in the same fact, so completion commits with the grade
 * that caused it.
 */
export const recordPartResults = (
  run: PersistedUnitRun,
  results: readonly UnitPartResult[],
): Effect.Effect<PersistedUnitRun, UnitStateContractError> =>
  Effect.gen(function* () {
    const round = activeRound(run.cursor);
    const open = openParts(run.cursor);
    if (!round || open.length === 0) {
      return yield* contractFailure("There are no open parts to grade.");
    }
    if (results.length !== open.length) {
      return yield* contractFailure("Grade every open part exactly once.");
    }
    for (const [index, result] of results.entries()) {
      const part = open[index];
      const graded = result.criterionResults.map((entry) => entry.dimensionId);
      if (
        !part ||
        graded.length !== part.criterionIds.length ||
        part.criterionIds.some((id) => !graded.includes(id))
      ) {
        return yield* contractFailure(
          "Each part is graded on exactly its own criteria.",
        );
      }
      if (result.met !== result.criterionResults.every((entry) => entry.met)) {
        return yield* contractFailure(
          "A part is met exactly when every one of its criteria is met.",
        );
      }
      if (!result.met && result.errorCodes.length === 0) {
        return yield* contractFailure(
          "A missed part requires a diagnostic error code.",
        );
      }
    }
    let resultIndex = 0;
    const graded: UnitRoundStep = {
      ...round,
      parts: round.parts.map((part) =>
        part.result === null
          ? { ...part, result: results[resultIndex++] ?? null }
          : part,
      ),
    };
    const steps = [...run.cursor.steps.slice(0, -1), graded];
    const move = nextMove(steps, unitCriterionIds(run));
    return withCursor(run, {
      ...run.cursor,
      steps,
      outcome: move.kind === "complete" ? move.outcome : null,
      // Codes accumulate across the whole run so the critic can reuse the name
      // it already gave a mistake instead of coining a synonym for it.
      errorCodeHistory: [
        ...new Set([
          ...run.cursor.errorCodeHistory,
          ...results.flatMap((result) => result.errorCodes),
        ]),
      ].slice(-24),
    });
  });

// ---------------------------------------------------------------------------
// The prepared step: generated ahead, used only if nothing happened since.
// ---------------------------------------------------------------------------

export const takePreparedDraft = <K extends UnitPreparedStep["draft"]["kind"]>(
  cursor: UnitCursor,
  kind: K,
): Extract<UnitPreparedStep["draft"], { kind: K }> | null => {
  const prepared = cursor.prepared;
  return prepared?.interactionId === cursor.interactionId &&
    prepared.draft.kind === kind
    ? (prepared.draft as Extract<UnitPreparedStep["draft"], { kind: K }>)
    : null;
};

export const withPreparedDraft = (
  run: PersistedUnitRun,
  draft: UnitPreparedStep["draft"],
): PersistedUnitRun =>
  projectUnitRun({
    ...run,
    cursor: {
      ...run.cursor,
      prepared: { interactionId: run.cursor.interactionId, draft },
    },
  });
