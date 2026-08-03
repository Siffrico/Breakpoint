import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import type { DbError } from "../../../effect/errors";
import type { EducationExperienceDefinition } from "../education-unit/experience";
import type { PersistedUnitRun } from "../education-unit/unit-state";
import type { RecallCandidate, RecallTarget } from "../policies/recall-decay";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type { WorkspaceProjectionReaderSource } from "./workspace-reader";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { createUnitRun } from "../education-unit/unit-state";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { isUnitMidFlight, planWorkspaceTurn } from "./orchestrator";
import {
  CurriculumNotReadyError,
  NoRunnableWorkspaceTurnError,
} from "./workspace-errors";
import {
  makeWorkspaceProjectionReader,
  WorkspaceProjectionReader,
} from "./workspace-reader";

export type WorkspaceTurnDependencies = WorkspaceProjectionReaderSource;

export const findLatestPhaseResponse = <T extends PhaseResponseRecord>(
  responses: readonly T[],
  matches: (response: T) => boolean,
): T | undefined => {
  for (let index = responses.length - 1; index >= 0; index -= 1) {
    const response = responses[index];
    if (response && matches(response)) return response;
  }
  return undefined;
};

export interface ResolvedWorkspaceTurn {
  plan: CurriculumPlan;
  state: WorkspaceAiState;
  node: CurriculumNode;
  unit: UnitContent;
  unitRun: PersistedUnitRun;
  unitResponses: PhaseResponseRecord[];
  /** Set when this turn is a recall interlude: the skills to compose. */
  recallFocus: RecallTarget | null;
}

interface PlannedRecall {
  target: RecallTarget;
  node: CurriculumNode;
  /** Present only when resuming the durable recall cursor. */
  run: PersistedUnitRun | null;
}

export const getNextReadyLearningNode = (nodes: CurriculumNode[]) =>
  nodes.find((node) => node.kind === "unit" && node.status === "ready") ?? null;

const isLearningUnit = <T extends Pick<CurriculumNode, "kind">>(
  node: T | null,
): node is T => node?.kind === "unit";

export type UnitAdvanceGate =
  | { status: "locked" }
  | { status: "enabled"; unitId: string; nextTitle: string | null };

export const isUnitAwaitingAdvance = ({
  node,
  run,
}: {
  node: Pick<CurriculumNode, "kind" | "status"> | null;
  run: PersistedUnitRun | null;
}) =>
  isLearningUnit(node) &&
  node.status === "ready" &&
  run?.kind === "education" &&
  run.mode === "complete";

export const isUnitAwaitingPass2 = ({
  node,
  run,
}: {
  node: Pick<CurriculumNode, "kind" | "status"> | null;
  run: PersistedUnitRun | null;
}) =>
  isLearningUnit(node) &&
  node.status === "ready" &&
  run?.kind === "education" &&
  run.mode === "awaiting_pass2";

export const assertUnitCanAdvance = ({
  node,
  run,
}: {
  node: Pick<CurriculumNode, "kind" | "status"> | null;
  run: PersistedUnitRun | null;
}) => {
  if (!node || !isLearningUnit(node)) {
    throw new Error("Unit not found.");
  }
  if (node.status === "completed") {
    return;
  }
  if (node.status !== "ready") {
    throw new Error("Unit is not active.");
  }
  if (run?.kind !== "education" || run.mode !== "complete") {
    throw new Error("Unit is not complete yet.");
  }
};

export const getUnitAdvanceGate = ({
  node,
  run,
  nextNode,
}: {
  node: CurriculumNode | null;
  run: PersistedUnitRun | null;
  nextNode: CurriculumNode | null;
}): UnitAdvanceGate => {
  if (!node || !isUnitAwaitingAdvance({ node, run })) {
    return { status: "locked" };
  }

  return {
    status: "enabled",
    unitId: node.id,
    nextTitle: nextNode?.title ?? null,
  };
};

export const findWorkspaceTurnNode = ({
  nodes,
  state,
}: {
  nodes: CurriculumNode[];
  state: { activeUnitId: string | null; recallUnitId: string | null };
}) =>
  nodes.find(
    (node) => node.id === (state.activeUnitId ?? state.recallUnitId),
  ) ?? null;

/**
 * Produces a recall run projection without materializing it. An in-flight
 * recall run with unfinished review resumes; anything else projects a fresh
 * reviewer run. The first claimed commit materializes it on the shared unit
 * row.
 */
export const resolveRecallRunProjection = ({
  sessionId,
  userId,
  unit,
  existing,
  experience = DEFAULT_EDUCATION_EXPERIENCE,
}: {
  sessionId: string;
  userId?: string | null;
  unit: UnitContent;
  existing: PersistedUnitRun | null;
  experience?: EducationExperienceDefinition;
}): PersistedUnitRun => {
  if (existing?.kind === "recall" && existing.mode !== "complete") {
    return existing;
  }
  if (!unit.unitMasteryContract) {
    throw new Error("The recall unit has no capability contract.");
  }

  return createUnitRun({
    unitId: unit.id,
    sessionId,
    userId,
    kind: "recall",
    masteryContract: unit.unitMasteryContract,
    experience,
  });
};

/** Rehydrates the persisted one-or-two entry recall target. */
const rehydrateRecallTarget = ({
  knowledgeIds,
  candidates,
}: {
  knowledgeIds: readonly string[];
  candidates: readonly RecallCandidate[];
}): RecallTarget | null => {
  const [primaryId, companionId, ...unexpectedIds] = knowledgeIds;
  if (!primaryId || unexpectedIds.length > 0) return null;

  const primary = candidates.find((entry) => entry.id === primaryId);
  const companion = companionId
    ? (candidates.find((entry) => entry.id === companionId) ?? null)
    : null;
  if (!primary?.evidenceNodeId || (companionId && !companion)) return null;
  if (companion && companion.skillNodeId !== primary.skillNodeId) return null;

  return {
    skillNodeId: primary.skillNodeId,
    evidenceNodeId: primary.evidenceNodeId,
    primary,
    companion,
  };
};

const resolvePersistedRecall = ({
  plan,
  run,
  knowledgeIds,
  candidates,
}: {
  plan: CurriculumPlan;
  run: PersistedUnitRun;
  knowledgeIds: readonly string[] | undefined;
  candidates: readonly RecallCandidate[];
}): PlannedRecall | null => {
  const target = knowledgeIds
    ? rehydrateRecallTarget({ knowledgeIds, candidates })
    : null;
  if (!target) return null;

  const node = plan.nodes.find((item) => item.id === target.evidenceNodeId);
  return node?.status === "completed" ? { target, node, run } : null;
};

export const loadPlannedRecall = ({
  sessionId,
  plan,
  active,
  inFlightRun,
  repairStaleRun,
}: {
  sessionId: string;
  plan: CurriculumPlan;
  active: NextReadyUnitProjection;
  inFlightRun: PersistedUnitRun | null;
  repairStaleRun: boolean;
}): EffectType.Effect<
  PlannedRecall | null,
  DbError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;

    if (inFlightRun) {
      const responses = yield* reader.getPhaseResponses(
        inFlightRun.unitId,
        sessionId,
      );
      const knowledgeIds = findLatestPhaseResponse(
        responses,
        (response) => response.metadata?.recallEntryIds !== undefined,
      )?.metadata?.recallEntryIds;
      const candidates = knowledgeIds
        ? yield* reader.getRecallCandidatesByIds(plan.id, knowledgeIds)
        : [];
      const resumed = resolvePersistedRecall({
        plan,
        run: inFlightRun,
        knowledgeIds,
        candidates,
      });
      if (resumed) return resumed;
      if (repairStaleRun) {
        yield* Effect.logWarning("Retiring a stale in-flight recall run.", {
          sessionId,
          unitContentId: inFlightRun.unitId,
        });
        // Best-effort self-healing: a failed retirement must not block the turn
        // — the stale run simply gets retried on the next resolution.
        yield* reader
          .retireInFlightRecallRun(sessionId, inFlightRun.unitId)
          .pipe(
            Effect.catch((cause) =>
              Effect.logError("Stale recall retirement failed.", {
                cause,
                sessionId,
                unitContentId: inFlightRun.unitId,
              }),
            ),
          );
      }
    }

    if (
      isUnitMidFlight({
        activeUnitResponses: active.responses,
        activeUnitRun: active.run,
      })
    ) {
      return null;
    }

    const now = new Date();
    const primary = yield* reader.getMostOverdueRecallCandidate(plan.id, now);
    if (!primary?.evidenceNodeId) return null;
    const node = plan.nodes.find((item) => item.id === primary.evidenceNodeId);
    if (node?.status !== "completed") return null;
    const companion = yield* reader.getRecallCompanionCandidate(
      primary.skillNodeId,
      primary,
      now,
    );
    return {
      target: {
        skillNodeId: primary.skillNodeId,
        evidenceNodeId: primary.evidenceNodeId,
        primary,
        companion,
      },
      node,
      run: null,
    };
  });

/**
 * Produces a run projection without materializing it. Lease acquisition
 * creates a missing durable row before the model runs; the turn commit is
 * still the only operation that advances the projected state.
 */
export const resolveUnitRunProjection = ({
  sessionId,
  userId,
  unit,
  existing,
  experience = DEFAULT_EDUCATION_EXPERIENCE,
}: {
  sessionId: string;
  userId?: string | null;
  unit: UnitContent;
  existing: PersistedUnitRun | null;
  experience?: EducationExperienceDefinition;
}): PersistedUnitRun => {
  if (existing?.kind === "education") {
    return existing;
  }
  if (!unit.unitMasteryContract) {
    throw new Error("The education unit has no capability contract.");
  }

  return createUnitRun({
    unitId: unit.id,
    sessionId,
    userId,
    kind: "education",
    masteryContract: unit.unitMasteryContract,
    experience,
  });
};

export interface NextReadyUnitProjection {
  node: CurriculumNode | null;
  unit: UnitContent | null;
  responses: PhaseResponseRecord[];
  run: PersistedUnitRun | null;
}

/**
 * Takes the plan's nodes and a session id; produces the next-ready learning
 * node's unit, phase responses, and in-memory run projection. A missing unit
 * is not a failure here because each caller owns that decision.
 */
export const loadNextReadyUnitProjection = ({
  sessionId,
  nodes,
}: {
  sessionId: string;
  nodes: CurriculumNode[];
}): EffectType.Effect<
  NextReadyUnitProjection,
  DbError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;
    const node = getNextReadyLearningNode(nodes);
    const unit = node ? yield* reader.getUnitByNodeId(node.id) : null;
    if (!unit) {
      return { node, unit: null, responses: [], run: null };
    }
    const [responses, existingRun] = yield* Effect.all(
      [
        reader.getPhaseResponses(unit.id, sessionId),
        reader.getUnitRun(sessionId, unit.id),
      ],
      { concurrency: 2 },
    );
    const experience = existingRun
      ? DEFAULT_EDUCATION_EXPERIENCE
      : yield* reader.getEducationExperience();
    return {
      node,
      unit,
      responses,
      run: resolveUnitRunProjection({
        sessionId,
        unit,
        existing: existingRun,
        experience,
      }),
    };
  });

/**
 * Takes a workspace session id and curriculum accessors, produces the runnable
 * turn with its unit and response history, and fails only when the curriculum
 * is missing, no turn is runnable, or the active unit is not ready.
 */
export const resolveWorkspaceTurnEffect = ({
  sessionId,
  authorizedPlan,
  repairStaleRun = true,
}: {
  sessionId: string;
  authorizedPlan?: CurriculumPlan;
  repairStaleRun?: boolean;
}): EffectType.Effect<
  ResolvedWorkspaceTurn,
  | DbError
  | CurriculumNotReadyError
  | NoRunnableWorkspaceTurnError
  | UnitNotReadyError,
  WorkspaceProjectionReader
> =>
  Effect.gen(function* () {
    const reader = yield* WorkspaceProjectionReader;
    const plan = authorizedPlan ?? (yield* reader.getActivePlan(sessionId));

    if (!plan) {
      return yield* new CurriculumNotReadyError({
        message: "Curriculum is not ready yet.",
      });
    }

    const [active, inFlightRun] = yield* Effect.all(
      [
        loadNextReadyUnitProjection({ sessionId, nodes: plan.nodes }),
        reader.getInFlightRecallRun(sessionId),
      ],
      { concurrency: 2 },
    );
    if (active.node && !active.unit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: active.node.id,
      });
    }

    const plannedRecall = yield* loadPlannedRecall({
      sessionId,
      plan,
      active,
      inFlightRun,
      repairStaleRun,
    });

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
      recallTarget: plannedRecall
        ? {
            unitNodeId: plannedRecall.node.id,
            unitTitle: plannedRecall.node.title,
          }
        : null,
    });

    if (!state) {
      return yield* new NoRunnableWorkspaceTurnError({
        message: "There is no runnable workspace turn.",
      });
    }

    const node = findWorkspaceTurnNode({ nodes: plan.nodes, state });
    const unit =
      node?.id === active.node?.id
        ? active.unit
        : node
          ? yield* reader.getUnitByNodeId(node.id)
          : null;

    if (!unit || !node) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: node?.id,
      });
    }

    const isRecallTurn = state.recallUnitId !== null;
    const reusesActiveUnit = unit.id === active.unit?.id;
    const needsRunRead =
      !isRecallTurn && !(reusesActiveUnit && active.run !== null);
    const [unitResponses, existingRun] = yield* Effect.all(
      [
        reusesActiveUnit
          ? Effect.succeed(active.responses)
          : reader.getPhaseResponses(unit.id, sessionId),
        needsRunRead
          ? reader.getUnitRun(sessionId, unit.id)
          : Effect.succeed<PersistedUnitRun | null>(null),
      ],
      { concurrency: 2 },
    );
    const selectedExistingRun = isRecallTurn
      ? (plannedRecall?.run ?? null)
      : reusesActiveUnit
        ? active.run
        : existingRun;
    const experience = selectedExistingRun
      ? DEFAULT_EDUCATION_EXPERIENCE
      : yield* reader.getEducationExperience();
    const unitRun = isRecallTurn
      ? resolveRecallRunProjection({
          sessionId,
          unit,
          existing: plannedRecall?.run ?? null,
          experience,
        })
      : reusesActiveUnit && active.run
        ? active.run
        : resolveUnitRunProjection({
            sessionId,
            unit,
            existing: existingRun,
            experience,
          });

    const resolvedState = {
      ...state,
      educationStage: unitRun.mode,
      workflowId: `${unitRun.experience.id}@${unitRun.experience.version}`,
    };

    return {
      plan,
      state: resolvedState,
      node,
      unit,
      unitRun,
      unitResponses,
      recallFocus: isRecallTurn ? (plannedRecall?.target ?? null) : null,
    };
  });

export const resolveWorkspaceTurn = async ({
  sessionId,
  authorizedPlan,
  repairStaleRun,
  deps,
}: {
  sessionId: string;
  authorizedPlan?: CurriculumPlan;
  repairStaleRun?: boolean;
  deps: WorkspaceProjectionReaderSource;
}): Promise<ResolvedWorkspaceTurn> => {
  const exit = await Effect.runPromiseExit(
    resolveWorkspaceTurnEffect({
      sessionId,
      authorizedPlan,
      repairStaleRun,
    }).pipe(
      Effect.provideService(
        WorkspaceProjectionReader,
        makeWorkspaceProjectionReader(deps),
      ),
    ),
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};
