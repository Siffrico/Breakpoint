import type { db as databaseClient } from "@acme/db/client";
import { and, asc, eq } from "@acme/db";
import { TrainingCurriculumNode, TrainingKnowledgeTopic } from "@acme/db/schema";

import { designKnowledgeModel } from "../domain/training/agents/knowledge-model-designer";
import { normalizeKnowledgeTopicTree } from "../domain/training/policies/knowledge-topic-tree";

type Database = typeof databaseClient;

const listByAbility = (db: Database, abilityNodeId: string) =>
  db.query.TrainingKnowledgeTopic.findMany({
    where: eq(TrainingKnowledgeTopic.abilityNodeId, abilityNodeId),
    orderBy: [asc(TrainingKnowledgeTopic.orderIndex)],
  });

export const knowledgeTopicRepository = {
  getTopicTreeByAbility: ({ db, abilityNodeId }: { db: Database; abilityNodeId: string }) => listByAbility(db, abilityNodeId),
  ensureAbilityKnowledgeModel: async ({ db, abilityNodeId, targetIdentity }: { db: Database; abilityNodeId: string; targetIdentity: string }) => {
    const existing = await listByAbility(db, abilityNodeId);
    if (existing.length > 0) return existing;
    const ability = await db.query.TrainingCurriculumNode.findFirst({ where: eq(TrainingCurriculumNode.id, abilityNodeId) });
    if (!ability?.skillMap || ability.kind !== "ability") return [];
    const skills = await db.query.TrainingCurriculumNode.findMany({
      where: and(eq(TrainingCurriculumNode.parentNodeId, ability.id), eq(TrainingCurriculumNode.kind, "skill")),
      orderBy: [asc(TrainingCurriculumNode.orderIndex)],
    });
    const output = await designKnowledgeModel({ title: ability.title, summary: ability.summary, workflow: ability.skillMap.workflow, childSkillTitles: skills.map((skill) => skill.title), targetIdentity });
    const normalized = normalizeKnowledgeTopicTree(output.topics);
    try {
      return await db.transaction(async (tx) => {
        const transactionDb = tx as unknown as Database;
        const raced = await listByAbility(transactionDb, abilityNodeId);
        if (raced.length > 0) return raced;
        const ids = new Map<string, string>();
        for (const topic of normalized) {
          const [inserted] = await transactionDb.insert(TrainingKnowledgeTopic).values({
            planId: ability.planId, abilityNodeId,
            parentTopicId: topic.parentSlug ? ids.get(topic.parentSlug) ?? null : null,
            slug: topic.slug, title: topic.title, gloss: topic.gloss, coreIdea: topic.coreIdea,
            misconception: topic.misconception, orderIndex: topic.orderIndex,
          }).returning({ id: TrainingKnowledgeTopic.id });
          if (!inserted) throw new Error("Knowledge topic insert did not return an id.");
          ids.set(topic.slug, inserted.id);
        }
        return listByAbility(transactionDb, abilityNodeId);
      });
    } catch (error) {
      // A concurrent ensure (build prewarm racing recovery) can commit first and
      // fail this insert on the (abilityNodeId, slug) unique index. The other
      // writer's tree is just as good — return it instead of degrading the
      // ability to topic-less syllabi.
      const committed = await listByAbility(db, abilityNodeId);
      if (committed.length > 0) return committed;
      throw error;
    }
  },
};
