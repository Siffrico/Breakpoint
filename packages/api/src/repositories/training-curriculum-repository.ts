import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, inArray } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingIdentityProfileVersion,
  TrainingOnboardingSession,
  TrainingUnitContent,
  TrainingUnitPhaseResponse,
} from "@acme/db/schema";

import type {
  ProgressionNode,
  StatusChange,
} from "../domain/training/engine/plan-progression";
import type {
  CurriculumBlueprint,
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../domain/training/types/training.types";
import { planCompletion } from "../domain/training/engine/plan-progression";
import { insertBlueprintNodes } from "./training-curriculum-node-writer";

type Database = typeof databaseClient;

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date =
    value instanceof Date && typeof value.toISOString === "function"
      ? value
      : new Date(String(value));

  return date.toISOString();
};

interface ActivePlanState {
  plan: typeof TrainingCurriculumPlan.$inferSelect;
  nodes: CurriculumNode[];
  nextUnitId: string | null;
}

const toCurriculumPlan = (state: ActivePlanState): CurriculumPlan => ({
  id: state.plan.id,
  title: state.plan.title,
  summary: state.plan.summary,
  targetIdentity: state.plan.targetIdentity,
  overview: state.plan.overview
    ? {
        title: state.plan.overview.title,
        summary: state.plan.overview.summary,
        generatedAt: toIsoString(state.plan.overviewGeneratedAt),
      }
    : null,
  nodes: state.nodes,
  nextUnitId: state.nextUnitId,
});

const mapUnitContent = ({
  node,
  unit,
  clusterBriefing,
}: {
  node: typeof TrainingCurriculumNode.$inferSelect;
  unit: typeof TrainingUnitContent.$inferSelect;
  clusterBriefing: UnitContent["clusterBriefing"];
}): UnitContent => ({
  id: unit.id,
  nodeId: unit.nodeId,
  title: unit.title,
  summary: node.summary,
  whyItMatters: node.whyItMatters,
  learningGoal: node.summary,
  difficultyBands: node.difficultyBands as UnitContent["difficultyBands"],
  clusterArcFrame: unit.clusterArcFrame,
  clusterBriefing,
  scenario: {
    title: unit.scenarioTitle,
    focusAreas: unit.scenarioFocusAreas,
  },
  unitContext: unit.unitContextJson,
});

type CurriculumNodeRow = typeof TrainingCurriculumNode.$inferSelect;

/**
 * Load a node and every node in its plan (ordered), the working set the pure
 * progression engine reasons over. Returns null when the node does not exist.
 */
const loadPlanNodes = async (
  db: Database,
  nodeId: string,
): Promise<{
  target: CurriculumNodeRow;
  planNodes: CurriculumNodeRow[];
} | null> => {
  const target = await db.query.TrainingCurriculumNode.findFirst({
    where: eq(TrainingCurriculumNode.id, nodeId),
  });
  if (!target) {
    return null;
  }

  const planNodes = await db.query.TrainingCurriculumNode.findMany({
    where: eq(TrainingCurriculumNode.planId, target.planId),
    orderBy: asc(TrainingCurriculumNode.orderIndex),
  });

  return { target, planNodes };
};

const toProgressionNodes = (rows: CurriculumNodeRow[]): ProgressionNode[] =>
  rows.map((row) => ({
    id: row.id,
    parentNodeId: row.parentNodeId,
    kind: row.kind as CurriculumNodeKind,
    status: row.status as CurriculumNodeStatus,
    orderIndex: row.orderIndex,
  }));

const applyStatusChanges = async (db: Database, changes: StatusChange[]) => {
  for (const change of changes) {
    await db
      .update(TrainingCurriculumNode)
      .set({ status: change.status })
      .where(eq(TrainingCurriculumNode.id, change.nodeId));
  }
};

export const trainingCurriculumRepository = {
  createPlan: async ({
    db,
    onboardingSessionId,
    profileVersionId,
    userId,
    blueprint,
  }: {
    db: Database;
    onboardingSessionId: string;
    profileVersionId: string;
    userId?: string | null;
    blueprint: CurriculumBlueprint;
  }) => {
    const [plan] = await db
      .insert(TrainingCurriculumPlan)
      .values({
        userId: userId ?? null,
        onboardingSessionId,
        profileVersionId,
        title: blueprint.title,
        summary: blueprint.summary,
        targetIdentity: blueprint.targetIdentity,
        overview: blueprint.overview
          ? {
              title: blueprint.overview.title,
              summary: blueprint.overview.summary,
              body: blueprint.overview.body,
            }
          : null,
        overviewGeneratedAt: blueprint.overview
          ? blueprint.overview.generatedAt
            ? new Date(blueprint.overview.generatedAt)
            : new Date()
          : null,
      })
      .returning();

    if (!plan) {
      return null;
    }

    await insertBlueprintNodes({ db, planId: plan.id, blueprint });

    return plan;
  },

  renameActivePlan: async ({
    db,
    sessionId,
    title,
  }: {
    db: Database;
    sessionId: string;
    title: string;
  }) => {
    const [plan] = await db
      .update(TrainingCurriculumPlan)
      .set({ title })
      .where(eq(TrainingCurriculumPlan.onboardingSessionId, sessionId))
      .returning();

    return plan ?? null;
  },

  getPlanWithNodes: async ({
    db,
    sessionId,
    userId,
    requireActive,
  }: {
    db: Database;
    sessionId: string;
    userId?: string;
    requireActive: boolean;
  }): Promise<ActivePlanState | null> => {
    const plan = userId
      ? (
          await db
            .select({ plan: TrainingCurriculumPlan })
            .from(TrainingCurriculumPlan)
            .innerJoin(
              TrainingOnboardingSession,
              eq(
                TrainingOnboardingSession.id,
                TrainingCurriculumPlan.onboardingSessionId,
              ),
            )
            .where(
              and(
                eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
                eq(TrainingOnboardingSession.userId, userId),
              ),
            )
            .limit(1)
        )[0]?.plan
      : await db.query.TrainingCurriculumPlan.findFirst({
          where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
        });

    // A plan is readable only after its identity profile has been persisted.
    // Learner-facing reads additionally require the final active status.
    if (
      !plan?.profileVersionId ||
      (requireActive && plan.status !== "active")
    ) {
      return null;
    }

    const [profileVersion, nodeRows] = await Promise.all([
      db.query.TrainingIdentityProfileVersion.findFirst({
        where: eq(TrainingIdentityProfileVersion.id, plan.profileVersionId),
      }),
      db.query.TrainingCurriculumNode.findMany({
        where: eq(TrainingCurriculumNode.planId, plan.id),
        orderBy: asc(TrainingCurriculumNode.orderIndex),
      }),
    ]);

    if (!profileVersion) {
      return null;
    }

    const nodes = nodeRows.map((node) => ({
      id: node.id,
      parentNodeId: node.parentNodeId,
      kind: node.kind as CurriculumNode["kind"],
      title: node.title,
      summary: node.summary,
      whyItMatters: node.whyItMatters,
      learningGoal: node.summary,
      orderIndex: node.orderIndex,
      depth: node.depth,
      positionColumn: node.positionColumn,
      positionRow: node.positionRow,
      status: node.status as CurriculumNode["status"],
      difficultyBands: node.difficultyBands ?? null,
    }));

    const nextUnitNode = nodeRows.find(
      (node) => node.kind === "unit" && node.status === "ready",
    );

    return {
      plan,
      nodes,
      nextUnitId: nextUnitNode?.id ?? null,
    };
  },

  getActivePlan: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<CurriculumPlan | null> => {
    const planState = await trainingCurriculumRepository.getPlanWithNodes({
      db,
      sessionId,
      requireActive: true,
    });

    if (!planState) {
      return null;
    }

    return toCurriculumPlan(planState);
  },

  getBuildPlan: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<CurriculumPlan | null> => {
    const planState = await trainingCurriculumRepository.getPlanWithNodes({
      db,
      sessionId,
      requireActive: false,
    });
    return planState ? toCurriculumPlan(planState) : null;
  },

  getOwnedActivePlan: async ({
    db,
    sessionId,
    userId,
  }: {
    db: Database;
    sessionId: string;
    userId: string;
  }): Promise<CurriculumPlan | null> => {
    const planState = await trainingCurriculumRepository.getPlanWithNodes({
      db,
      sessionId,
      userId,
      requireActive: true,
    });
    return planState ? toCurriculumPlan(planState) : null;
  },

  getProjectOverview: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan?.overview) {
      return null;
    }

    return {
      ...plan.overview,
      generatedAt: toIsoString(plan.overviewGeneratedAt),
    };
  },

  listPlansBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }): Promise<(typeof TrainingCurriculumPlan.$inferSelect)[]> => {
    if (sessionIds.length === 0) {
      return [];
    }

    return db.query.TrainingCurriculumPlan.findMany({
      where: inArray(TrainingCurriculumPlan.onboardingSessionId, sessionIds),
      orderBy: desc(TrainingCurriculumPlan.createdAt),
    });
  },

  listNodesByPlanIds: async ({
    db,
    planIds,
  }: {
    db: Database;
    planIds: string[];
  }): Promise<(typeof TrainingCurriculumNode.$inferSelect)[]> => {
    if (planIds.length === 0) {
      return [];
    }

    return db.query.TrainingCurriculumNode.findMany({
      where: inArray(TrainingCurriculumNode.planId, planIds),
      orderBy: [
        asc(TrainingCurriculumNode.planId),
        asc(TrainingCurriculumNode.orderIndex),
      ],
    });
  },

  getUnitByNodeId: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }): Promise<UnitContent | null> => {
    const [node, unit] = await Promise.all([
      db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, nodeId),
      }),
      db.query.TrainingUnitContent.findFirst({
        where: eq(TrainingUnitContent.nodeId, nodeId),
      }),
    ]);

    if (!node || !unit) {
      return null;
    }

    const parentNode = node.parentNodeId
      ? await db.query.TrainingCurriculumNode.findFirst({
          where: eq(TrainingCurriculumNode.id, node.parentNodeId),
        })
      : null;

    return mapUnitContent({
      node,
      unit,
      clusterBriefing: (parentNode?.briefing ??
        null) as UnitContent["clusterBriefing"],
    });
  },

  listUnitContentsByNodeIds: async ({
    db,
    nodeIds,
  }: {
    db: Database;
    nodeIds: string[];
  }): Promise<UnitContent[]> => {
    if (nodeIds.length === 0) {
      return [];
    }

    const nodes = await db.query.TrainingCurriculumNode.findMany({
      where: inArray(TrainingCurriculumNode.id, nodeIds),
    });
    const units = await db.query.TrainingUnitContent.findMany({
      where: inArray(TrainingUnitContent.nodeId, nodeIds),
    });

    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const parentIds = Array.from(
      new Set(
        nodes
          .map((node) => node.parentNodeId)
          .filter((parentId): parentId is string => parentId != null),
      ),
    );
    const parentRows = parentIds.length
      ? await db.query.TrainingCurriculumNode.findMany({
          where: inArray(TrainingCurriculumNode.id, parentIds),
        })
      : [];
    const parentsById = new Map(parentRows.map((node) => [node.id, node]));

    return units
      .map((unit) => {
        const node = nodesById.get(unit.nodeId);
        if (!node) {
          return null;
        }

        return mapUnitContent({
          node,
          unit,
          clusterBriefing: (node.parentNodeId
            ? parentsById.get(node.parentNodeId)?.briefing
            : null) as UnitContent["clusterBriefing"],
        });
      })
      .filter((unit): unit is UnitContent => unit != null);
  },

  getNodeById: async ({ db, nodeId }: { db: Database; nodeId: string }) =>
    (await db.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, nodeId),
    })) ?? null,

  getPlanNodesBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      return null;
    }

    return db.query.TrainingCurriculumNode.findMany({
      where: eq(TrainingCurriculumNode.planId, plan.id),
      orderBy: asc(TrainingCurriculumNode.orderIndex),
    });
  },

  createUnitContentIfAbsent: async ({
    db,
    nodeId,
    title,
    clusterArcFrame,
    scenario,
    unitContext = null,
  }: {
    db: Database;
    nodeId: string;
    title: string;
    clusterArcFrame: string;
    scenario: UnitContent["scenario"];
    unitContext?: UnitContent["unitContext"];
  }): Promise<UnitContent | null> => {
    // Build-level mutual exclusion lives in unit-build-lock.ts and is held by
    // the caller for the whole prepare. Taking the same advisory lock here on
    // a second pooled connection would self-deadlock against that holder, so
    // this write relies on onConflictDoNothing alone for row-level dedup.
    return db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      await transactionDb
        .insert(TrainingUnitContent)
        .values({
          nodeId,
          title,
          clusterArcFrame,
          scenarioTitle: scenario.title,
          scenarioFocusAreas: scenario.focusAreas,
          unitContextJson: unitContext,
        })
        .onConflictDoNothing({ target: [TrainingUnitContent.nodeId] });

      return trainingCurriculumRepository.getUnitByNodeId({
        db: transactionDb,
        nodeId,
      });
    });
  },

  replaceUnitContent: async ({
    db,
    nodeId,
    title,
    clusterArcFrame,
    scenario,
    unitContext = null,
  }: {
    db: Database;
    nodeId: string;
    title: string;
    clusterArcFrame: string;
    scenario: UnitContent["scenario"];
    unitContext?: UnitContent["unitContext"];
  }): Promise<UnitContent | null> => {
    const [replaced] = await db
      .update(TrainingUnitContent)
      .set({
        title,
        clusterArcFrame,
        scenarioTitle: scenario.title,
        scenarioFocusAreas: scenario.focusAreas,
        unitContextJson: unitContext,
      })
      .where(eq(TrainingUnitContent.nodeId, nodeId))
      .returning({ id: TrainingUnitContent.id });

    return replaced
      ? trainingCurriculumRepository.getUnitByNodeId({ db, nodeId })
      : null;
  },

  saveNodeBriefing: async ({
    db,
    nodeId,
    briefing,
  }: {
    db: Database;
    nodeId: string;
    briefing: UnitContent["clusterBriefing"];
  }) => {
    if (!briefing) {
      return null;
    }

    const [node] = await db
      .update(TrainingCurriculumNode)
      .set({
        briefing,
      })
      .where(eq(TrainingCurriculumNode.id, nodeId))
      .returning();

    return (node?.briefing ?? null) as UnitContent["clusterBriefing"];
  },

  savePhaseResponse: async ({
    db,
    unitContentId,
    sessionId,
    userId,
    phase,
    sequence,
    userResponse,
    aiResponse,
    passed,
    score,
    metadata,
  }: {
    db: Database;
    unitContentId: string;
    sessionId: string;
    userId?: string | null;
    phase: PhaseResponseRecord["phase"];
    sequence: number;
    userResponse: string;
    aiResponse?: string | null;
    passed?: boolean | null;
    score?: number | null;
    metadata?: PhaseResponseRecord["metadata"];
  }): Promise<PhaseResponseRecord | null> => {
    const [response] = await db
      .insert(TrainingUnitPhaseResponse)
      .values({
        unitContentId,
        sessionId,
        userId: userId ?? null,
        phase,
        sequence,
        userResponse,
        aiResponse: aiResponse ?? null,
        passed: passed ?? null,
        score: score ?? null,
        metadata: metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [
          TrainingUnitPhaseResponse.unitContentId,
          TrainingUnitPhaseResponse.sessionId,
          TrainingUnitPhaseResponse.phase,
          TrainingUnitPhaseResponse.sequence,
        ],
        set: {
          userId: userId ?? null,
          userResponse,
          aiResponse: aiResponse ?? null,
          passed: passed ?? null,
          score: score ?? null,
          metadata: metadata ?? null,
        },
      })
      .returning();

    return response
      ? {
          id: response.id,
          unitContentId: response.unitContentId,
          sessionId: response.sessionId,
          userId: response.userId,
          phase: response.phase as PhaseResponseRecord["phase"],
          sequence: response.sequence,
          userResponse: response.userResponse,
          aiResponse: response.aiResponse,
          passed: response.passed,
          score: response.score,
          metadata: response.metadata as PhaseResponseRecord["metadata"],
          createdAt: response.createdAt,
        }
      : null;
  },

  getPhaseResponses: async ({
    db,
    unitContentId,
    sessionId,
    phase,
  }: {
    db: Database;
    unitContentId: string;
    sessionId: string;
    phase?: PhaseResponseRecord["phase"];
  }): Promise<PhaseResponseRecord[]> => {
    const rows = await db.query.TrainingUnitPhaseResponse.findMany({
      where: phase
        ? and(
            eq(TrainingUnitPhaseResponse.unitContentId, unitContentId),
            eq(TrainingUnitPhaseResponse.sessionId, sessionId),
            eq(TrainingUnitPhaseResponse.phase, phase),
          )
        : and(
            eq(TrainingUnitPhaseResponse.unitContentId, unitContentId),
            eq(TrainingUnitPhaseResponse.sessionId, sessionId),
          ),
      orderBy: [
        asc(TrainingUnitPhaseResponse.sequence),
        asc(TrainingUnitPhaseResponse.createdAt),
      ],
    });

    return rows.map((row) => ({
      id: row.id,
      unitContentId: row.unitContentId,
      sessionId: row.sessionId,
      userId: row.userId,
      phase: row.phase as PhaseResponseRecord["phase"],
      sequence: row.sequence,
      userResponse: row.userResponse,
      aiResponse: row.aiResponse,
      passed: row.passed,
      score: row.score,
      metadata: row.metadata as PhaseResponseRecord["metadata"],
      createdAt: row.createdAt,
    }));
  },

  getLatestFailureIsolation: async ({
    db,
    unitContentId,
    sessionId,
  }: {
    db: Database;
    unitContentId: string;
    sessionId: string;
  }): Promise<{
    gap: NonNullable<NonNullable<PhaseResponseRecord["metadata"]>["gap"]>;
    evidenceAnchors?: string[];
    repairTarget?: NonNullable<
      NonNullable<PhaseResponseRecord["metadata"]>["repairTarget"]
    >;
    ghostScenario: NonNullable<
      NonNullable<PhaseResponseRecord["metadata"]>["ghostScenario"]
    >;
    sequence: number;
    submitted: boolean;
  } | null> => {
    const row = await db.query.TrainingUnitPhaseResponse.findFirst({
      where: and(
        eq(TrainingUnitPhaseResponse.unitContentId, unitContentId),
        eq(TrainingUnitPhaseResponse.sessionId, sessionId),
        eq(TrainingUnitPhaseResponse.phase, "ghost"),
      ),
      orderBy: [
        desc(TrainingUnitPhaseResponse.sequence),
        desc(TrainingUnitPhaseResponse.createdAt),
      ],
    });

    const metadata = row?.metadata as PhaseResponseRecord["metadata"];
    if (!row || !metadata?.gap || !metadata.ghostScenario) {
      return null;
    }

    return {
      gap: metadata.gap,
      evidenceAnchors: metadata.evidenceAnchors,
      repairTarget: metadata.repairTarget,
      ghostScenario: metadata.ghostScenario,
      sequence: row.sequence,
      submitted: row.aiResponse != null,
    };
  },

  markNodeCompleted: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }) => {
    const loaded = await loadPlanNodes(db, nodeId);
    if (!loaded) {
      return;
    }

    await applyStatusChanges(
      db,
      planCompletion(toProgressionNodes(loaded.planNodes), nodeId),
    );
  },

  completeNode: async ({ db, nodeId }: { db: Database; nodeId: string }) => {
    const node = await trainingCurriculumRepository.getNodeById({ db, nodeId });
    if (node?.kind !== "unit") return null;
    await db
      .update(TrainingCurriculumNode)
      .set({ status: "completed" })
      .where(eq(TrainingCurriculumNode.id, nodeId));
    return node;
  },

  /** Promotes a pre-generated planned node into the live ready slot. */
  markNodeReady: async ({ db, nodeId }: { db: Database; nodeId: string }) => {
    await db
      .update(TrainingCurriculumNode)
      .set({ status: "ready" })
      .where(eq(TrainingCurriculumNode.id, nodeId));
  },
};
