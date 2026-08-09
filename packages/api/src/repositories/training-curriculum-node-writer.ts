import type { db as databaseClient } from "@acme/db/client";
import { and, desc, eq, inArray, sql } from "@acme/db";
import { TrainingCurriculumNode, TrainingKnowledgeItem } from "@acme/db/schema";

import type { CurriculumBlueprint } from "../domain/training/types/training.types";

type Database = typeof databaseClient;

export const insertBlueprintNodes = async ({
  db,
  planId,
  blueprint,
}: {
  db: Database;
  planId: string;
  blueprint: CurriculumBlueprint;
}) => {
  const insertedNodes = await db
    .insert(TrainingCurriculumNode)
    .values(
      blueprint.nodes.map((node) => ({
        planId,
        kind: node.kind,
        status: node.status,
        title: node.title,
        summary: node.summary,
        whyItMatters: node.whyItMatters,
        orderIndex: node.orderIndex,
        depth: node.depth,
        positionColumn: node.positionColumn,
        positionRow: node.positionRow,
        difficultyBands: node.difficultyBands ?? null,
        outcomeResult: node.outcomeResult,
        skillMap: node.skillMap,
        practiceContract: node.practiceContract,
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
      .update(TrainingCurriculumNode)
      .set({ parentNodeId: parentNode.id })
      .where(eq(TrainingCurriculumNode.id, insertedNode.id));
  }

  return insertedNodes;
};

export const appendDynamicUnitNode = async ({
  db,
  skillNodeId,
  title,
  summary,
  whyItMatters,
  difficultyBands,
  targetKnowledgeIds,
  status = "ready",
}: {
  db: Database;
  skillNodeId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  difficultyBands: {
    order: number;
    minRating: number;
    maxRating: number;
    label?: string;
  }[];
  targetKnowledgeIds: string[];
  status?: "planned" | "ready";
}) =>
  db.transaction(async (tx) => {
    const transactionDb = tx as unknown as Database;
    await transactionDb.execute(
      sql`select pg_advisory_xact_lock(hashtext(${skillNodeId}))`,
    );
    const cluster = await transactionDb.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, skillNodeId),
    });
    if (!cluster) throw new Error("Outcome was not found.");
    await transactionDb.execute(
      sql`select pg_advisory_xact_lock(hashtext(${cluster.planId}), hashtext('create-unit-order'))`,
    );

    const open = await transactionDb.query.TrainingCurriculumNode.findFirst({
      where: and(
        eq(TrainingCurriculumNode.parentNodeId, skillNodeId),
        eq(TrainingCurriculumNode.kind, "unit"),
        eq(TrainingCurriculumNode.status, status),
      ),
      orderBy: [desc(TrainingCurriculumNode.orderIndex)],
    });
    if (open) return { node: open, created: false } as const;

    const latest = await transactionDb.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.planId, cluster.planId),
      orderBy: [desc(TrainingCurriculumNode.orderIndex)],
    });
    const latestSibling =
      await transactionDb.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.parentNodeId, skillNodeId),
        orderBy: [desc(TrainingCurriculumNode.positionRow)],
      });
    const [node] = await transactionDb
      .insert(TrainingCurriculumNode)
      .values({
        planId: cluster.planId,
        parentNodeId: cluster.id,
        kind: "unit",
        status,
        title,
        summary,
        whyItMatters,
        difficultyBands,
        orderIndex: (latest?.orderIndex ?? 0) + 1,
        depth: 2,
        positionColumn: cluster.positionColumn,
        positionRow: Math.max(latestSibling?.positionRow ?? 1, 1) + 1,
      })
      .returning();
    if (!node) throw new Error("Dynamic unit could not be persisted.");

    if (targetKnowledgeIds.length > 0) {
      await transactionDb
        .update(TrainingKnowledgeItem)
        .set({ status: "targeted" })
        .where(inArray(TrainingKnowledgeItem.id, targetKnowledgeIds));
    }
    return { node, created: true } as const;
  });
