import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import { TrainingCurriculumNode } from "@acme/db/schema";

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
