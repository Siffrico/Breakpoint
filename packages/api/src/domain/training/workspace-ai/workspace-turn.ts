import type { Effect as EffectType } from "effect";
import { Cause, Effect, Exit } from "effect";

import { UnitContextSchema } from "@acme/validators";

import type { DbError } from "../../../effect/errors";
import type { EducationExperienceDefinition } from "../education-unit/experience";
import type { PersistedUnitRun } from "../education-unit/unit-state";
import type {
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiState } from "./types";
import type { WorkspaceProjectionReaderSource } from "./workspace-reader";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";
import { getUnitReadinessIssue } from "../education-unit/unit-readiness";
import { createUnitRun } from "../education-unit/unit-state";
import { UnitNotReadyError } from "../unit-preparation/errors";
import { planWorkspaceTurn } from "./orchestrator";
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

export const isUnitAwaitingNextPass = ({
  node,
  run,
}: {
  node: Pick<CurriculumNode, "kind" | "status"> | null;
  run: PersistedUnitRun | null;
}) =>
  isLearningUnit(node) &&
  node.status === "ready" &&
  run?.kind === "education" &&
  run.mode === "awaiting_next_pass";

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
  const unitContext = UnitContextSchema.safeParse(unit.unitContext);
  if (!unitContext.success) {
    throw new Error("The education unit has no authoritative context.");
  }

  return createUnitRun({
    unitId: unit.id,
    sessionId,
    userId,
    kind: "education",
    unitContext: unitContext.data,
    experience,
  });
};

export interface NextReadyUnitProjection {
  node: CurriculumNode | null;
  unit: UnitContent | null;
  responses: PhaseResponseRecord[];
  run: PersistedUnitRun | null;
  hasPersistedRun: boolean;
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
    if (!unit || getUnitReadinessIssue(unit) !== null) {
      return {
        node,
        unit: null,
        responses: [],
        run: null,
        hasPersistedRun: false,
      };
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
      hasPersistedRun: existingRun !== null,
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
}: {
  sessionId: string;
  authorizedPlan?: CurriculumPlan;
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

    const active = yield* loadNextReadyUnitProjection({
      sessionId,
      nodes: plan.nodes,
    });
    if (active.node && !active.unit) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: active.node.id,
      });
    }

    const state = planWorkspaceTurn({
      nodes: plan.nodes,
      activeUnitResponses: active.responses,
      activeUnitRun: active.run,
      hasPersistedActiveUnitRun: active.hasPersistedRun,
      recallTarget: null,
    });

    if (!state) {
      return yield* new NoRunnableWorkspaceTurnError({
        message: "There is no runnable workspace turn.",
      });
    }

    const node = findWorkspaceTurnNode({ nodes: plan.nodes, state });
    const unit = node?.id === active.node?.id ? active.unit : null;

    if (
      !unit ||
      !node ||
      !UnitContextSchema.safeParse(unit.unitContext).success
    ) {
      return yield* new UnitNotReadyError({
        message: "UNIT_PREPARING",
        nodeId: node?.id,
      });
    }

    const unitResponses = active.responses;
    const existingRun = active.run;
    const experience = existingRun
      ? DEFAULT_EDUCATION_EXPERIENCE
      : yield* reader.getEducationExperience();
    const unitRun =
      existingRun ??
      resolveUnitRunProjection({
        sessionId,
        unit,
        existing: null,
        experience,
      });

    const resolvedState = {
      ...state,
      educationStage: unitRun.mode,
      interactionId: unitRun.cursor.interactionId,
      workflowId: `${unitRun.experience.id}@${unitRun.experience.version}`,
    };

    return {
      plan,
      state: resolvedState,
      node,
      unit,
      unitRun,
      unitResponses,
    };
  });

export const resolveWorkspaceTurn = async ({
  sessionId,
  authorizedPlan,
  deps,
}: {
  sessionId: string;
  authorizedPlan?: CurriculumPlan;
  deps: WorkspaceProjectionReaderSource;
}): Promise<ResolvedWorkspaceTurn> => {
  const exit = await Effect.runPromiseExit(
    resolveWorkspaceTurnEffect({
      sessionId,
      authorizedPlan,
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
