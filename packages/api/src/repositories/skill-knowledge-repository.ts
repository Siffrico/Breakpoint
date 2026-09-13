import type { db as databaseClient } from "@acme/db/client";
import type {
  DifficultyBand,
  PracticeContract,
  SkillMap,
} from "@acme/validators";
import { and, asc, eq, inArray, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingKnowledgeItem,
  TrainingKnowledgeQuestion,
} from "@acme/db/schema";

import { recallDueAt } from "../domain/training/recall/scheduling";

type Database = typeof databaseClient;

export const clampKnowledgeIds = ({
  requestedKnowledgeIds,
  targetedKnowledgeIds,
}: {
  requestedKnowledgeIds: string[];
  targetedKnowledgeIds: string[];
}) => {
  const allowed = new Set(targetedKnowledgeIds);
  const uniqueRequested = [...new Set(requestedKnowledgeIds)];
  return {
    accepted: uniqueRequested.filter((id) => allowed.has(id)),
    deferred: uniqueRequested.filter((id) => !allowed.has(id)),
  };
};

const knowledgeSelection = {
  id: TrainingKnowledgeItem.id,
  questionId: TrainingKnowledgeQuestion.id,
  skillNodeId: TrainingKnowledgeQuestion.skillNodeId,
  question: TrainingKnowledgeQuestion.question,
  questionOrderIndex: TrainingKnowledgeQuestion.orderIndex,
  practiceCount: TrainingKnowledgeQuestion.practiceCount,
  orderIndex: TrainingKnowledgeItem.orderIndex,
  kind: TrainingKnowledgeItem.kind,
  label: TrainingKnowledgeItem.label,
  content: TrainingKnowledgeItem.content,
  status: TrainingKnowledgeItem.status,
  checkedAt: TrainingKnowledgeItem.checkedAt,
  strength: TrainingKnowledgeItem.strength,
  lastReinforcedAt: TrainingKnowledgeItem.lastReinforcedAt,
  evidenceNodeId: TrainingKnowledgeItem.evidenceNodeId,
  createdAt: TrainingKnowledgeItem.createdAt,
};

const listKnowledge = async ({
  db,
  skillNodeId,
}: {
  db: Database;
  skillNodeId: string;
}) =>
  db
    .select(knowledgeSelection)
    .from(TrainingKnowledgeItem)
    .innerJoin(
      TrainingKnowledgeQuestion,
      eq(TrainingKnowledgeQuestion.id, TrainingKnowledgeItem.questionId),
    )
    .where(eq(TrainingKnowledgeQuestion.skillNodeId, skillNodeId))
    .orderBy(
      asc(TrainingKnowledgeQuestion.orderIndex),
      asc(TrainingKnowledgeItem.orderIndex),
    );

export const skillKnowledgeRepository = {
  ensureOutcomeCurriculum: async ({
    db,
    outcomeNodeId,
    skillMap,
    practiceContract,
    difficultyBands,
  }: {
    db: Database;
    outcomeNodeId: string;
    skillMap: SkillMap;
    practiceContract: PracticeContract;
    difficultyBands: DifficultyBand[];
  }) =>
    db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      await transactionDb.execute(
        sql`select pg_advisory_xact_lock(hashtext(${outcomeNodeId}))`,
      );
      const node = await transactionDb.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, outcomeNodeId),
      });
      if (node?.kind !== "outcome") return null;
      const existing = await listKnowledge({
        db: transactionDb,
        skillNodeId: outcomeNodeId,
      });
      if (node.skillMap && node.practiceContract && existing.length > 0) {
        return existing;
      }

      await transactionDb
        .update(TrainingCurriculumNode)
        .set({ skillMap, practiceContract, difficultyBands })
        .where(eq(TrainingCurriculumNode.id, outcomeNodeId));

      for (const [skillIndex, skill] of skillMap.skills.entries()) {
        const [insertedQuestion] = await transactionDb
          .insert(TrainingKnowledgeQuestion)
          .values({
            skillNodeId: outcomeNodeId,
            orderIndex: skillIndex,
            question: skill.name,
          })
          .returning({ id: TrainingKnowledgeQuestion.id });
        if (!insertedQuestion) {
          throw new Error("Skill Map entry insert did not return an id.");
        }
        await transactionDb.insert(TrainingKnowledgeItem).values(
          skill.items.map((item, orderIndex) => ({
            questionId: insertedQuestion.id,
            orderIndex,
            kind: item.kind,
            label: item.name,
            content: item.description,
          })),
        );
      }

      return listKnowledge({ db: transactionDb, skillNodeId: outcomeNodeId });
    }),

  listKnowledge,

  getUnitContext: async ({
    db,
    unitNodeId,
  }: {
    db: Database;
    unitNodeId: string;
  }) => {
    const unit = await db.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, unitNodeId),
    });
    if (!unit?.parentNodeId) return null;
    const cluster = await db.query.TrainingCurriculumNode.findFirst({
      where: eq(TrainingCurriculumNode.id, unit.parentNodeId),
    });
    if (!cluster?.skillMap || !cluster.practiceContract) return null;
    const entries = await listKnowledge({ db, skillNodeId: cluster.id });
    const targeted = entries.filter((entry) => entry.status === "targeted");
    return {
      skillNodeId: cluster.id,
      workflow: cluster.practiceContract.workflow,
      framing: null,
      checked: entries
        .filter((entry) => entry.status === "checked")
        .map(({ label, content }) => ({ label, content })),
      targets: targeted.map(({ id, question, kind, label, content }) => ({
        id,
        skill: question,
        kind: kind as "concept" | "mechanism",
        label,
        content,
      })),
    };
  },

  checkOffKnowledge: async ({
    db,
    requestedKnowledgeIds,
    targetedKnowledgeIds,
    evidenceNodeId,
  }: {
    db: Database;
    requestedKnowledgeIds: string[];
    targetedKnowledgeIds: string[];
    evidenceNodeId: string;
  }) => {
    const { accepted: acceptedIds, deferred } = clampKnowledgeIds({
      requestedKnowledgeIds,
      targetedKnowledgeIds,
    });
    return db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      const checkedAt = new Date();
      const checked =
        acceptedIds.length === 0
          ? []
          : await transactionDb
              .update(TrainingKnowledgeItem)
              .set({
                status: "checked",
                checkedAt,
                strength: 0,
                lastReinforcedAt: null,
                reviewDueAt: recallDueAt(0, checkedAt),
                evidenceNodeId,
              })
              .where(inArray(TrainingKnowledgeItem.id, acceptedIds))
              .returning({ id: TrainingKnowledgeItem.id });

      const checkedIds = checked.map((entry) => entry.id);
      const missing = acceptedIds.filter((id) => !checkedIds.includes(id));
      if (targetedKnowledgeIds.length > 0) {
        await transactionDb
          .update(TrainingKnowledgeItem)
          .set({ status: "unchecked" })
          .where(
            and(
              inArray(TrainingKnowledgeItem.id, targetedKnowledgeIds),
              eq(TrainingKnowledgeItem.status, "targeted"),
            ),
          );
      }
      return { checked: checkedIds, deferred: [...deferred, ...missing] };
    });
  },

  incrementSkillPractice: async ({
    db,
    knowledgeIds,
  }: {
    db: Database;
    knowledgeIds: string[];
  }) => {
    if (knowledgeIds.length === 0) return;
    const targetedSkills = await db
      .selectDistinct({ id: TrainingKnowledgeItem.questionId })
      .from(TrainingKnowledgeItem)
      .where(inArray(TrainingKnowledgeItem.id, knowledgeIds))
      .limit(2);
    const skill = targetedSkills[0];
    if (targetedSkills.length !== 1 || !skill) {
      throw new Error("A completed unit must target exactly one skill.");
    }
    await db
      .update(TrainingKnowledgeQuestion)
      .set({
        practiceCount: sql`${TrainingKnowledgeQuestion.practiceCount} + 1`,
      })
      .where(eq(TrainingKnowledgeQuestion.id, skill.id));
  },
};
