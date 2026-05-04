import { and, asc, desc, eq, inArray } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  BecomingCurriculumNode,
  BecomingCurriculumPlan,
  BecomingIdentityProfileVersion,
  BecomingUnitContent,
  BecomingUnitPhaseResponse,
} from "@acme/db/schema";

import type {
  BeforeAfterProfile,
  CurriculumBlueprint,
  CurriculumNode,
  CurriculumPlan,
  PhaseResponseRecord,
  UpdateUnitContentInput,
  UnitContent,
} from "../domain/becoming/types/becoming.types";

type Database = typeof databaseClient;

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
  node: typeof BecomingCurriculumNode.$inferSelect;
  unit: typeof BecomingUnitContent.$inferSelect;
  clusterBriefing: UnitContent["clusterBriefing"];
}): UnitContent => ({
  id: unit.id,
  nodeId: unit.nodeId,
  title: unit.title,
  summary: node.summary,
  whyItMatters: node.whyItMatters,
  learningGoal: node.summary,
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
});

export const becomingCurriculumRepository = {
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
      .insert(BecomingCurriculumPlan)
      .values({
        userId: userId ?? null,
        onboardingSessionId,
        profileVersionId,
        title: blueprint.title,
        summary: blueprint.summary,
        targetIdentity: blueprint.targetIdentity,
      })
      .returning();

    if (!plan) {
      return null;
    }

    const insertedNodes = await db
      .insert(BecomingCurriculumNode)
      .values(
        blueprint.nodes.map((node) => ({
          planId: plan.id,
          kind: node.kind,
          status: node.status,
          title: node.title,
          summary: node.summary,
          whyItMatters: node.whyItMatters,
          orderIndex: node.orderIndex,
          depth: node.depth,
          positionColumn: node.positionColumn,
          positionRow: node.positionRow,
          parentNodeId: null,
        })),
      )
      .returning();

    const nodesByOrder = new Map(
      insertedNodes.map((node) => [node.orderIndex, node]),
    );

    for (const blueprintNode of blueprint.nodes) {
      if (blueprintNode.parentOrderIndex == null) {
        continue;
      }

      const insertedNode = nodesByOrder.get(blueprintNode.orderIndex);
      const parentNode = nodesByOrder.get(blueprintNode.parentOrderIndex);
      if (!insertedNode || !parentNode) {
        continue;
      }

      await db
        .update(BecomingCurriculumNode)
        .set({ parentNodeId: parentNode.id })
        .where(eq(BecomingCurriculumNode.id, insertedNode.id));
    }

    return plan;
  },

  getActivePlanWithNodes: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<{
    plan: typeof BecomingCurriculumPlan.$inferSelect;
    beforeAfter: BeforeAfterProfile;
    nodes: CurriculumNode[];
    nextUnitId: string | null;
  } | null> => {
    const plan = await db.query.BecomingCurriculumPlan.findFirst({
      where: eq(BecomingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      return null;
    }

    const profileVersion = await db.query.BecomingIdentityProfileVersion.findFirst({
      where: eq(BecomingIdentityProfileVersion.id, plan.profileVersionId),
    });

    if (!profileVersion) {
      return null;
    }

    const nodeRows = await db.query.BecomingCurriculumNode.findMany({
      where: eq(BecomingCurriculumNode.planId, plan.id),
      orderBy: asc(BecomingCurriculumNode.orderIndex),
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
    const planState = await becomingCurriculumRepository.getActivePlanWithNodes({
      db,
      sessionId,
    });

    if (!planState) {
      return null;
    }

    return {
      id: planState.plan.id,
      title: planState.plan.title,
      summary: planState.plan.summary,
      targetIdentity: planState.plan.targetIdentity,
      beforeAfter: planState.beforeAfter,
      nodes: planState.nodes,
      nextUnitId: planState.nextUnitId,
    };
  },

  listPlansBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }) => {
    if (sessionIds.length === 0) {
      return [];
    }

    return db.query.BecomingCurriculumPlan.findMany({
      where: inArray(BecomingCurriculumPlan.onboardingSessionId, sessionIds),
      orderBy: desc(BecomingCurriculumPlan.createdAt),
    });
  },

  getUnitByNodeId: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }): Promise<UnitContent | null> => {
    const node = await db.query.BecomingCurriculumNode.findFirst({
      where: eq(BecomingCurriculumNode.id, nodeId),
    });
    const unit = await db.query.BecomingUnitContent.findFirst({
      where: eq(BecomingUnitContent.nodeId, nodeId),
    });

    if (!node || !unit) {
      return null;
    }

    const parentNode = node.parentNodeId
      ? await db.query.BecomingCurriculumNode.findFirst({
          where: eq(BecomingCurriculumNode.id, node.parentNodeId),
        })
      : null;

    return mapUnitContent({
      node,
      unit,
      clusterBriefing: (parentNode?.briefing ?? null) as UnitContent["clusterBriefing"],
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

    const nodes = await db.query.BecomingCurriculumNode.findMany({
      where: inArray(BecomingCurriculumNode.id, nodeIds),
    });
    const units = await db.query.BecomingUnitContent.findMany({
      where: inArray(BecomingUnitContent.nodeId, nodeIds),
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
      ? await db.query.BecomingCurriculumNode.findMany({
          where: inArray(BecomingCurriculumNode.id, parentIds),
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

  getNodeById: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }) =>
    (await db.query.BecomingCurriculumNode.findFirst({
      where: eq(BecomingCurriculumNode.id, nodeId),
    })) ?? null,

  getPlanNodesBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const plan = await db.query.BecomingCurriculumPlan.findFirst({
      where: eq(BecomingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      return null;
    }

    return db.query.BecomingCurriculumNode.findMany({
      where: eq(BecomingCurriculumNode.planId, plan.id),
      orderBy: asc(BecomingCurriculumNode.orderIndex),
    });
  },

  createUnitContent: async ({
    db,
    nodeId,
    title,
    seedPrompt,
    seedHint,
    clusterArcFrame,
    complexityBudget,
    teachbackSetup,
    scenario,
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
  }): Promise<UnitContent | null> => {
    const [unit] = await db
      .insert(BecomingUnitContent)
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
      })
      .onConflictDoUpdate({
        target: [BecomingUnitContent.nodeId],
        set: {
          title,
          seedPrompt,
          seedHint,
          clusterArcFrame,
          complexityBudget,
          teachbackSetup,
          scenarioTitle: scenario.title,
          scenarioFocusAreas: scenario.focusAreas,
        },
      })
      .returning();

    if (!unit) {
      return null;
    }

    const node = await db.query.BecomingCurriculumNode.findFirst({
      where: eq(BecomingCurriculumNode.id, nodeId),
    });

    if (!node) {
      return null;
    }

    const parentNode = node.parentNodeId
      ? await db.query.BecomingCurriculumNode.findFirst({
          where: eq(BecomingCurriculumNode.id, node.parentNodeId),
        })
      : null;

    return mapUnitContent({
      node,
      unit,
      clusterBriefing: (parentNode?.briefing ?? null) as UnitContent["clusterBriefing"],
    });
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
      .update(BecomingCurriculumNode)
      .set({
        briefing,
      })
      .where(eq(BecomingCurriculumNode.id, nodeId))
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
      .update(BecomingUnitContent)
      .set(updatePayload)
      .where(eq(BecomingUnitContent.id, unitContentId))
      .returning();

    if (!unit) {
      return null;
    }

    const node = await db.query.BecomingCurriculumNode.findFirst({
      where: eq(BecomingCurriculumNode.id, unit.nodeId),
    });

    if (!node) {
      return null;
    }

    const parentNode = node.parentNodeId
      ? await db.query.BecomingCurriculumNode.findFirst({
          where: eq(BecomingCurriculumNode.id, node.parentNodeId),
        })
      : null;

    return mapUnitContent({
      node,
      unit,
      clusterBriefing: (parentNode?.briefing ?? null) as UnitContent["clusterBriefing"],
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
      .insert(BecomingUnitPhaseResponse)
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
          BecomingUnitPhaseResponse.unitContentId,
          BecomingUnitPhaseResponse.sessionId,
          BecomingUnitPhaseResponse.phase,
          BecomingUnitPhaseResponse.sequence,
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
    const rows = await db.query.BecomingUnitPhaseResponse.findMany({
      where: phase
        ? and(
            eq(BecomingUnitPhaseResponse.unitContentId, unitContentId),
            eq(BecomingUnitPhaseResponse.sessionId, sessionId),
            eq(BecomingUnitPhaseResponse.phase, phase),
          )
        : and(
            eq(BecomingUnitPhaseResponse.unitContentId, unitContentId),
            eq(BecomingUnitPhaseResponse.sessionId, sessionId),
          ),
      orderBy: [asc(BecomingUnitPhaseResponse.sequence), asc(BecomingUnitPhaseResponse.createdAt)],
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
    const rows = await db.query.BecomingUnitPhaseResponse.findMany({
      where: eq(BecomingUnitPhaseResponse.sessionId, sessionId),
      orderBy: [asc(BecomingUnitPhaseResponse.createdAt)],
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
  }): Promise<
    | {
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
      }
    | null
  > => {
    const row = await db.query.BecomingUnitPhaseResponse.findFirst({
      where: and(
        eq(BecomingUnitPhaseResponse.unitContentId, unitContentId),
        eq(BecomingUnitPhaseResponse.sessionId, sessionId),
        eq(BecomingUnitPhaseResponse.phase, "ghost"),
      ),
      orderBy: [desc(BecomingUnitPhaseResponse.sequence), desc(BecomingUnitPhaseResponse.createdAt)],
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
    await db
      .update(BecomingCurriculumNode)
      .set({ status: "completed" })
      .where(eq(BecomingCurriculumNode.id, nodeId));

    const completedNode = await db.query.BecomingCurriculumNode.findFirst({
      where: eq(BecomingCurriculumNode.id, nodeId),
    });

    if (!completedNode) {
      return;
    }

    const syncParentStatus = async (parentNodeId: string | null) => {
      if (!parentNodeId) {
        return;
      }

      const parentChildren = await db.query.BecomingCurriculumNode.findMany({
        where: eq(BecomingCurriculumNode.parentNodeId, parentNodeId),
        orderBy: asc(BecomingCurriculumNode.orderIndex),
      });
      if (parentChildren.length === 0) {
        return;
      }

      const parentStatus = parentChildren.every((node) => node.status === "completed")
        ? "completed"
        : parentChildren.some(
              (node) => node.status === "ready" || node.status === "completed",
            )
          ? "ready"
          : "planned";

      await db
        .update(BecomingCurriculumNode)
        .set({ status: parentStatus })
        .where(eq(BecomingCurriculumNode.id, parentNodeId));
    };

    await syncParentStatus(completedNode.parentNodeId);

  },

  advancePlanAfterCompletion: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }) => {
    const completedNode = await db.query.BecomingCurriculumNode.findFirst({
      where: eq(BecomingCurriculumNode.id, nodeId),
    });

    if (!completedNode) {
      return null;
    }

    const nextNode = await db.query.BecomingCurriculumNode.findMany({
      where: eq(BecomingCurriculumNode.planId, completedNode.planId),
      orderBy: asc(BecomingCurriculumNode.orderIndex),
    });

    const syncParentStatus = async (parentNodeId: string | null) => {
      if (!parentNodeId) {
        return;
      }

      const parentChildren = await db.query.BecomingCurriculumNode.findMany({
        where: eq(BecomingCurriculumNode.parentNodeId, parentNodeId),
        orderBy: asc(BecomingCurriculumNode.orderIndex),
      });
      if (parentChildren.length === 0) {
        return;
      }

      const parentStatus = parentChildren.every((node) => node.status === "completed")
        ? "completed"
        : parentChildren.some(
              (node) => node.status === "ready" || node.status === "completed",
            )
          ? "ready"
          : "planned";

      await db
        .update(BecomingCurriculumNode)
        .set({ status: parentStatus })
        .where(eq(BecomingCurriculumNode.id, parentNodeId));
    };

    if (completedNode.kind === "unit" && completedNode.parentNodeId) {
      const siblingUnits = nextNode.filter(
        (node) =>
          node.parentNodeId === completedNode.parentNodeId && node.kind === "unit",
      );
      const clusterFinished =
        siblingUnits.length > 0 &&
        siblingUnits.every((node) => node.status === "completed");

      if (clusterFinished) {
        const clusterSimulation = nextNode.find(
          (node) =>
            node.parentNodeId === completedNode.parentNodeId &&
            node.kind === "simulation" &&
            node.status === "planned",
        );

        if (clusterSimulation) {
          await db
            .update(BecomingCurriculumNode)
            .set({ status: "ready" })
            .where(eq(BecomingCurriculumNode.id, clusterSimulation.id));
          await syncParentStatus(clusterSimulation.parentNodeId);
          return clusterSimulation;
        }
      }
    }

    const nextPlannedUnit = nextNode.find(
      (node) => node.kind === "unit" && node.status === "planned",
    );
    if (nextPlannedUnit) {
      await db
        .update(BecomingCurriculumNode)
        .set({ status: "ready" })
        .where(eq(BecomingCurriculumNode.id, nextPlannedUnit.id));
      await syncParentStatus(nextPlannedUnit.parentNodeId);
      return nextPlannedUnit;
    }

    const regularUnits = nextNode.filter((node) => node.kind === "unit");
    const allRegularUnitsComplete =
      regularUnits.length > 0 &&
      regularUnits.every((node) => node.status === "completed");
    if (!allRegularUnitsComplete) {
      return null;
    }

    const nextIntegration = nextNode.find(
      (node) => node.kind === "integration" && node.status === "planned",
    );
    if (nextIntegration) {
      await db
        .update(BecomingCurriculumNode)
        .set({ status: "ready" })
        .where(eq(BecomingCurriculumNode.id, nextIntegration.id));
      await syncParentStatus(nextIntegration.parentNodeId);
      return nextIntegration;
    }

    return null;
  },

  completeNode: async ({
    db,
    nodeId,
  }: {
    db: Database;
    nodeId: string;
  }) => {
    await becomingCurriculumRepository.markNodeCompleted({
      db,
      nodeId,
    });

    await becomingCurriculumRepository.advancePlanAfterCompletion({
      db,
      nodeId,
    });
  },
};
