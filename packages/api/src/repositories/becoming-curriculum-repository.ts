import { asc, eq } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  BecomingCurriculumNode,
  BecomingCurriculumPlan,
  BecomingUnitContent,
} from "@acme/db/schema";

import type {
  CurriculumBlueprint,
  CurriculumNode,
  CurriculumPlan,
  UnitContent,
} from "../domain/becoming/types/becoming.types";

type Database = typeof databaseClient;

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

    for (const unit of blueprint.initialUnits) {
      const node = nodesByOrder.get(unit.nodeOrderIndex);
      if (!node) {
        continue;
      }

      await db.insert(BecomingUnitContent).values({
        nodeId: node.id,
        title: unit.title,
        concept: unit.concept,
        workedExample: unit.workedExample,
        retrievalItems: unit.retrievalItems,
        scenarioTitle: unit.scenario.title,
        scenarioPrompt: unit.scenario.prompt,
        focusAreas: unit.scenario.focusAreas,
        successCriteria: unit.scenario.successCriteria,
      });
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
    nodes: CurriculumNode[];
    nextUnitId: string | null;
  } | null> => {
    const plan = await db.query.BecomingCurriculumPlan.findFirst({
      where: eq(BecomingCurriculumPlan.onboardingSessionId, sessionId),
    });

    if (!plan) {
      return null;
    }

    const nodeRows = await db.query.BecomingCurriculumNode.findMany({
      where: eq(BecomingCurriculumNode.planId, plan.id),
      orderBy: asc(BecomingCurriculumNode.orderIndex),
    });

    const unitRows = await db.query.BecomingUnitContent.findMany();
    const unitByNodeId = new Map(unitRows.map((unit) => [unit.nodeId, unit]));

    const nodes = nodeRows.map((node) => ({
      id: node.id,
      parentNodeId: node.parentNodeId,
      kind: node.kind as CurriculumNode["kind"],
      title: node.title,
      summary: node.summary,
      whyItMatters: node.whyItMatters,
      orderIndex: node.orderIndex,
      depth: node.depth,
      positionColumn: node.positionColumn,
      positionRow: node.positionRow,
      status: node.status as CurriculumNode["status"],
    }));

    const nextUnitNode = nodeRows.find(
      (node) => node.kind === "unit" && node.status === "ready" && unitByNodeId.has(node.id),
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
      nodes: planState.nodes,
      nextUnitId: planState.nextUnitId,
    };
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

    return {
      id: unit.id,
      nodeId: unit.nodeId,
      title: unit.title,
      concept: unit.concept,
      workedExample: unit.workedExample,
      retrievalItems: unit.retrievalItems as UnitContent["retrievalItems"],
      scenario: {
        title: unit.scenarioTitle,
        prompt: unit.scenarioPrompt,
        focusAreas: unit.focusAreas,
        successCriteria: unit.successCriteria,
      },
    };
  },

  completeNode: async ({
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

    const nextNode = await db.query.BecomingCurriculumNode.findMany({
      where: eq(BecomingCurriculumNode.planId, completedNode.planId),
      orderBy: asc(BecomingCurriculumNode.orderIndex),
    });

    const nextReady = nextNode.find(
      (node) => node.kind === "unit" && node.status === "planned",
    );
    if (!nextReady) {
      return;
    }

    await db
      .update(BecomingCurriculumNode)
      .set({ status: "ready" })
      .where(eq(BecomingCurriculumNode.id, nextReady.id));
  },
};
