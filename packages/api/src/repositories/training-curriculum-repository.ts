import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, inArray, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingCurriculumPlan,
  TrainingIdentityProfileVersion,
  TrainingUnitContent,
  TrainingUnitPhaseResponse,
} from "@acme/db/schema";

import type {
  ProgressionNode,
  StatusChange,
} from "../domain/training/engine/plan-progression";
import type {
  BeforeAfterProfile,
  CurriculumBlueprint,
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
  UpdateUnitContentInput,
} from "../domain/training/types/training.types";
import {
  planAdvancement,
  planCompletion,
  usesDynamicMasteryLoop,
} from "../domain/training/engine/plan-progression";
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

const DEFAULT_SEED_HINT =
  "Start with your best guess. Name the distinction, mechanism, or real example you think matters most, even if you're not fully sure yet.";

const buildFallbackBeforeAfter = ({
  targetIdentity,
  headline,
  currentBaseline,
  behaviorSignals,
  firstShift,
}: {
  targetIdentity: string;
  headline: string;
  currentBaseline: string;
  behaviorSignals: string[];
  firstShift?: string | null;
}): BeforeAfterProfile => ({
  headline,
  beforeSummary: currentBaseline,
  afterSummary: `This path is training you to operate like ${targetIdentity}.`,
  contrastPairs: behaviorSignals.slice(0, 3).map((signal) => ({
    before: `This signal is not reliable yet: ${signal}`,
    after: signal,
  })),
  firstShift:
    firstShift ??
    "Move from intention and inconsistency into visible, repeatable behavior.",
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
  seedPrompt: unit.seedPrompt,
  seedHint: unit.seedHint ?? DEFAULT_SEED_HINT,
  clusterArcFrame: unit.clusterArcFrame,
  clusterBriefing,
  complexityBudget: unit.complexityBudget as UnitContent["complexityBudget"],
  buildContent: unit.buildContent,
  practicePrompts: unit.practicePrompts as UnitContent["practicePrompts"],
  teachbackSetup: unit.teachbackSetup as UnitContent["teachbackSetup"],
  scenario: {
    title: unit.scenarioTitle,
    focusAreas: unit.scenarioFocusAreas,
  },
  unitMasteryContract: unit.unitMasteryContractJson,
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

  getActivePlanWithNodes: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<{
    plan: typeof TrainingCurriculumPlan.$inferSelect;
    beforeAfter: BeforeAfterProfile;
    nodes: CurriculumNode[];
    nextUnitId: string | null;
  } | null> => {
    const plan = await db.query.TrainingCurriculumPlan.findFirst({
      where: eq(TrainingCurriculumPlan.onboardingSessionId, sessionId),
    });

    // A "generating" shell has no profile version linked yet — it is not a
    // loadable active plan, so the orchestrator's idempotency check sees null.
    if (!plan?.profileVersionId) {
      return null;
    }

    const profileVersion =
      await db.query.TrainingIdentityProfileVersion.findFirst({
        where: eq(TrainingIdentityProfileVersion.id, plan.profileVersionId),
      });

    if (!profileVersion) {
      return null;
    }

    const nodeRows = await db.query.TrainingCurriculumNode.findMany({
      where: eq(TrainingCurriculumNode.planId, plan.id),
      orderBy: asc(TrainingCurriculumNode.orderIndex),
    });

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
      (node) =>
        (node.kind === "unit" ||
          node.kind === "integration" ||
          node.kind === "simulation") &&
        node.status === "ready",
    );

    return {
      plan,
      beforeAfter:
        profileVersion.beforeAfterHeadline &&
        profileVersion.beforeStateSummary &&
        profileVersion.afterStateSummary &&
        profileVersion.beforeAfterContrastPairs &&
        profileVersion.beforeAfterContrastPairs.length > 0
          ? {
              headline: profileVersion.beforeAfterHeadline,
              beforeSummary: profileVersion.beforeStateSummary,
              afterSummary: profileVersion.afterStateSummary,
              contrastPairs: profileVersion.beforeAfterContrastPairs,
              firstShift:
                profileVersion.firstShift ??
                "Translate insight into visible changes under pressure.",
            }
          : buildFallbackBeforeAfter({
              targetIdentity: plan.targetIdentity,
              headline: profileVersion.headline,
              currentBaseline: profileVersion.currentBaseline,
              behaviorSignals: profileVersion.behaviorSignals,
              firstShift: profileVersion.firstShift,
            }),
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
    const planState = await trainingCurriculumRepository.getActivePlanWithNodes(
      {
        db,
        sessionId,
      },
    );

    if (!planState) {
      return null;
    }

    return {
      id: planState.plan.id,
      title: planState.plan.title,
      summary: planState.plan.summary,
      targetIdentity: planState.plan.targetIdentity,
      overview: planState.plan.overview
        ? {
            title: planState.plan.overview.title,
            summary: planState.plan.overview.summary,
            generatedAt: toIsoString(planState.plan.overviewGeneratedAt),
          }
        : null,
      beforeAfter: planState.beforeAfter,
      nodes: planState.nodes,
      nextUnitId: planState.nextUnitId,
    };
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
    const node = await db.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, nodeId),
    });
    const unit = await db.query.TrainingUnitContent.findFirst({
      where: eq(TrainingUnitContent.nodeId, nodeId),
    });

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
    seedPrompt,
    seedHint,
    clusterArcFrame,
    complexityBudget,
    teachbackSetup,
    scenario,
    unitMasteryContract = null,
  }: {
    db: Database;
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract?: UnitContent["unitMasteryContract"];
  }): Promise<UnitContent | null> => {
    return db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      await transactionDb.execute(
        sql`select pg_advisory_xact_lock(hashtext(${nodeId}), hashtext('prepare-unit-content'))`,
      );
      await transactionDb
        .insert(TrainingUnitContent)
        .values({
          nodeId,
          title,
          seedPrompt,
          seedHint,
          clusterArcFrame,
          complexityBudget,
          buildContent: null,
          practicePrompts: null,
          contentGeneratedAt: null,
          teachbackSetup,
          scenarioTitle: scenario.title,
          scenarioFocusAreas: scenario.focusAreas,
          unitMasteryContractJson: unitMasteryContract,
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
    seedPrompt,
    seedHint,
    clusterArcFrame,
    complexityBudget,
    teachbackSetup,
    scenario,
    unitMasteryContract = null,
  }: {
    db: Database;
    nodeId: string;
    title: string;
    seedPrompt: string;
    seedHint: string;
    clusterArcFrame: string;
    complexityBudget: UnitContent["complexityBudget"];
    teachbackSetup: UnitContent["teachbackSetup"];
    scenario: UnitContent["scenario"];
    unitMasteryContract?: UnitContent["unitMasteryContract"];
  }): Promise<UnitContent | null> => {
    const [replaced] = await db
      .update(TrainingUnitContent)
      .set({
        title,
        seedPrompt,
        seedHint,
        clusterArcFrame,
        complexityBudget,
        teachbackSetup,
        scenarioTitle: scenario.title,
        scenarioFocusAreas: scenario.focusAreas,
        unitMasteryContractJson: unitMasteryContract,
      })
      .where(eq(TrainingUnitContent.nodeId, nodeId))
      .returning({ id: TrainingUnitContent.id });

    return replaced
      ? trainingCurriculumRepository.getUnitByNodeId({ db, nodeId })
      : null;
  },

  updateUnitMasteryContract: async ({
    db,
    unitContentId,
    unitMasteryContract,
  }: {
    db: Database;
    unitContentId: string;
    unitMasteryContract: UnitContent["unitMasteryContract"];
  }) => {
    const [unit] = await db
      .update(TrainingUnitContent)
      .set({ unitMasteryContractJson: unitMasteryContract })
      .where(eq(TrainingUnitContent.id, unitContentId))
      .returning();

    return unit ?? null;
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

  updateUnitContent: async ({
    db,
    unitContentId,
    buildContent,
    practicePrompts,
    teachbackSetup,
    contentGeneratedAt,
  }: {
    db: Database;
  } & UpdateUnitContentInput): Promise<UnitContent | null> => {
    const updatePayload = {
      buildContent,
      practicePrompts,
      contentGeneratedAt,
      updatedAt: new Date(),
      ...(teachbackSetup ? { teachbackSetup } : {}),
    };

    const [unit] = await db
      .update(TrainingUnitContent)
      .set(updatePayload)
      .where(eq(TrainingUnitContent.id, unitContentId))
      .returning();

    if (!unit) {
      return null;
    }

    const node = await db.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, unit.nodeId),
    });

    if (!node) {
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

  listPhaseResponsesBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<PhaseResponseRecord[]> => {
    const rows = await db.query.TrainingUnitPhaseResponse.findMany({
      where: eq(TrainingUnitPhaseResponse.sessionId, sessionId),
      orderBy: [asc(TrainingUnitPhaseResponse.createdAt)],
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

  advancePlanAfterCompletion: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }): Promise<CurriculumNodeRow | null> => {
    const loaded = await loadPlanNodes(db, nodeId);
    if (!loaded) {
      return null;
    }

    const { advancedNodeId, changes } = planAdvancement(
      toProgressionNodes(loaded.planNodes),
      nodeId,
    );
    await applyStatusChanges(db, changes);

    return advancedNodeId
      ? (loaded.planNodes.find((node) => node.id === advancedNodeId) ?? null)
      : null;
  },

  completeNode: async ({ db, nodeId }: { db: Database; nodeId: string }) => {
    const node = await trainingCurriculumRepository.getNodeById({ db, nodeId });
    await trainingCurriculumRepository.markNodeCompleted({
      db,
      nodeId,
    });
    const parent = node?.parentNodeId
      ? await trainingCurriculumRepository.getNodeById({
          db,
          nodeId: node.parentNodeId,
        })
      : null;
    if (
      node &&
      usesDynamicMasteryLoop({
        nodeKind: node.kind as CurriculumNodeKind,
        parentHasSkillMap: Boolean(parent?.skillMap),
      })
    ) {
      return node;
    }
    return trainingCurriculumRepository.advancePlanAfterCompletion({
      db,
      nodeId,
    });
  },
};
