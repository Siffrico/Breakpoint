import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingKnowledgeItem,
  TrainingKnowledgeQuestion,
} from "@acme/db/schema";

import type { KnowledgeMapOutput } from "../domain/training/agents/contracts";
import type { RecallCandidate } from "../domain/training/policies/recall-decay";
import {
  RECALL_COMPANION_MIN_STRENGTH,
  recallIntervalDaysFor,
} from "../domain/training/policies/recall-decay";

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
  orderIndex: TrainingKnowledgeItem.orderIndex,
  kind: TrainingKnowledgeItem.kind,
  label: TrainingKnowledgeItem.label,
  content: TrainingKnowledgeItem.content,
  coverageCount: TrainingKnowledgeItem.coverageCount,
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

const recallCandidateSelection = {
  id: TrainingKnowledgeItem.id,
  questionId: TrainingKnowledgeQuestion.id,
  skillNodeId: TrainingKnowledgeQuestion.skillNodeId,
  questionOrderIndex: TrainingKnowledgeQuestion.orderIndex,
  orderIndex: TrainingKnowledgeItem.orderIndex,
  label: TrainingKnowledgeItem.label,
  content: TrainingKnowledgeItem.content,
  checkedAt: TrainingKnowledgeItem.checkedAt,
  strength: TrainingKnowledgeItem.strength,
  lastReinforcedAt: TrainingKnowledgeItem.lastReinforcedAt,
  evidenceNodeId: TrainingKnowledgeItem.evidenceNodeId,
};

interface RecallCandidateRow {
  id: string;
  questionId: string;
  skillNodeId: string;
  questionOrderIndex: number;
  orderIndex: number;
  label: string;
  content: string;
  checkedAt: Date | null;
  strength: number;
  lastReinforcedAt: Date | null;
  evidenceNodeId: string | null;
}

const mapRecallCandidate = (row: RecallCandidateRow): RecallCandidate | null =>
  row.checkedAt
    ? {
        ...row,
        checkedAt: row.checkedAt,
      }
    : null;

// These SQL expressions must stay equivalent to recall-decay.ts: ordering in
// the database is what keeps candidate transfer bounded to one primary row.
const recallAnchor = sql`coalesce(${TrainingKnowledgeItem.lastReinforcedAt}, ${TrainingKnowledgeItem.checkedAt})`;
const recallSeconds = (strength: 0 | 1 | 2 | 3) =>
  sql.raw(String(recallIntervalDaysFor(strength) * 86_400));
const recallIntervalSeconds = sql<number>`case
  when ${TrainingKnowledgeItem.strength} <= 0 then ${recallSeconds(0)}
  when ${TrainingKnowledgeItem.strength} = 1 then ${recallSeconds(1)}
  when ${TrainingKnowledgeItem.strength} = 2 then ${recallSeconds(2)}
  else ${recallSeconds(3)}
end`;
const recallOverdueRatio = (now: Date) =>
  sql<number>`extract(epoch from (${now.toISOString()}::timestamptz - ${recallAnchor})) / ${recallIntervalSeconds}`;

export const skillKnowledgeRepository = {
  ensureKnowledge: async ({
    db,
    skillNodeId,
    questions,
  }: {
    db: Database;
    skillNodeId: string;
    questions: KnowledgeMapOutput["questions"];
  }) =>
    db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      await transactionDb.execute(
        sql`select pg_advisory_xact_lock(hashtext(${skillNodeId}))`,
      );
      const existing = await listKnowledge({ db: transactionDb, skillNodeId });
      if (existing.length > 0) return existing;

      for (const [questionOrderIndex, question] of questions.entries()) {
        const [insertedQuestion] = await transactionDb
          .insert(TrainingKnowledgeQuestion)
          .values({
            skillNodeId,
            orderIndex: questionOrderIndex,
            question: question.question,
          })
          .returning({ id: TrainingKnowledgeQuestion.id });
        if (!insertedQuestion) {
          throw new Error("Knowledge question insert did not return an id.");
        }
        await transactionDb.insert(TrainingKnowledgeItem).values(
          question.items.map((item, orderIndex) => ({
            questionId: insertedQuestion.id,
            orderIndex,
            kind: item.kind,
            label: item.label,
            content: item.content,
          })),
        );
      }

      return listKnowledge({ db: transactionDb, skillNodeId });
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
    if (!cluster?.skillMap) return null;
    // Skillset units (parent = ability) own no knowledge rows of their own;
    // their checked and targeted items live on the ability's child skills.
    const ownerIds =
      cluster.kind === "ability"
        ? (
            await db.query.TrainingCurriculumNode.findMany({
              where: and(
                eq(TrainingCurriculumNode.parentNodeId, cluster.id),
                eq(TrainingCurriculumNode.kind, "skill"),
              ),
            })
          ).map((skill) => skill.id)
        : [cluster.id];
    const entries = (
      await Promise.all(
        ownerIds.map((skillNodeId) => listKnowledge({ db, skillNodeId })),
      )
    ).flat();
    const targeted = entries.filter((entry) => entry.status === "targeted");
    const framingQuestionId =
      cluster.kind === "skill" ? (targeted[0]?.questionId ?? null) : null;
    const priorPartCount = framingQuestionId
      ? new Set(
          entries
            .filter(
              (entry) =>
                entry.questionId === framingQuestionId &&
                entry.status === "checked" &&
                entry.evidenceNodeId,
            )
            .map((entry) => entry.evidenceNodeId),
        ).size
      : 0;
    return {
      skillNodeId: cluster.id,
      workflow: cluster.skillMap.workflow,
      framing:
        cluster.kind === "skill" && targeted[0]
          ? {
              question: targeted[0].question,
              part: priorPartCount + 1,
            }
          : null,
      checked: entries
        .filter((entry) => entry.status === "checked")
        .map(({ label, content }) => ({ label, content })),
      targets: targeted.map(({ id, kind, label, content }) => ({
        id,
        kind: kind as "concept" | "mechanism",
        label,
        content,
      })),
    };
  },

  // Scoped by entry id throughout: the targeted set may span multiple owning
  // skill nodes (skillset units), so a single skillNodeId cannot scope it.
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
      const checked =
        acceptedIds.length === 0
          ? []
          : await transactionDb
              .update(TrainingKnowledgeItem)
              .set({
                status: "checked",
                checkedAt: new Date(),
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

  getRecallCandidatesByIds: async ({
    db,
    planId,
    knowledgeIds,
  }: {
    db: Database;
    planId: string;
    knowledgeIds: readonly string[];
  }): Promise<RecallCandidate[]> => {
    if (knowledgeIds.length === 0) return [];
    const rows = await db
      .select(recallCandidateSelection)
      .from(TrainingKnowledgeItem)
      .innerJoin(
        TrainingKnowledgeQuestion,
        eq(TrainingKnowledgeQuestion.id, TrainingKnowledgeItem.questionId),
      )
      .innerJoin(
        TrainingCurriculumNode,
        eq(TrainingCurriculumNode.id, TrainingKnowledgeQuestion.skillNodeId),
      )
      .where(
        and(
          eq(TrainingCurriculumNode.planId, planId),
          eq(TrainingKnowledgeItem.status, "checked"),
          inArray(TrainingKnowledgeItem.id, [...knowledgeIds]),
        ),
      );

    return rows.flatMap((row) => {
      const candidate = mapRecallCandidate(row);
      return candidate ? [candidate] : [];
    });
  },

  getMostOverdueRecallCandidate: async ({
    db,
    planId,
    now,
  }: {
    db: Database;
    planId: string;
    now: Date;
  }): Promise<RecallCandidate | null> => {
    const overdueRatio = recallOverdueRatio(now);
    const [row] = await db
      .select(recallCandidateSelection)
      .from(TrainingKnowledgeItem)
      .innerJoin(
        TrainingKnowledgeQuestion,
        eq(TrainingKnowledgeQuestion.id, TrainingKnowledgeItem.questionId),
      )
      .innerJoin(
        TrainingCurriculumNode,
        eq(TrainingCurriculumNode.id, TrainingKnowledgeQuestion.skillNodeId),
      )
      .where(
        and(
          eq(TrainingCurriculumNode.planId, planId),
          eq(TrainingKnowledgeItem.status, "checked"),
          isNotNull(TrainingKnowledgeItem.checkedAt),
          isNotNull(TrainingKnowledgeItem.evidenceNodeId),
          sql`${overdueRatio} >= 1`,
        ),
      )
      .orderBy(desc(overdueRatio))
      .limit(1);

    return row ? mapRecallCandidate(row) : null;
  },

  getRecallCompanionCandidate: async ({
    db,
    skillNodeId,
    primary,
    now,
  }: {
    db: Database;
    skillNodeId: string;
    primary: Pick<
      RecallCandidate,
      "id" | "questionId" | "questionOrderIndex" | "orderIndex"
    >;
    now: Date;
  }): Promise<RecallCandidate | null> => {
    const overdueRatio = recallOverdueRatio(now);
    const chainOrdering = [
      sql`case when ${TrainingKnowledgeQuestion.id} = ${primary.questionId} then 0 else 1 end`,
      sql`abs(${TrainingKnowledgeQuestion.orderIndex} - ${primary.questionOrderIndex})`,
      sql`abs(${TrainingKnowledgeItem.orderIndex} - ${primary.orderIndex})`,
      sql`case
        when ${TrainingKnowledgeQuestion.id} = ${primary.questionId}
          and ${TrainingKnowledgeItem.orderIndex} > ${primary.orderIndex} then 1
        when ${TrainingKnowledgeQuestion.id} <> ${primary.questionId}
          and ${TrainingKnowledgeQuestion.orderIndex} > ${primary.questionOrderIndex} then 1
        else 0
      end`,
    ];
    const [row] = await db
      .select(recallCandidateSelection)
      .from(TrainingKnowledgeItem)
      .innerJoin(
        TrainingKnowledgeQuestion,
        eq(TrainingKnowledgeQuestion.id, TrainingKnowledgeItem.questionId),
      )
      .where(
        and(
          eq(TrainingKnowledgeQuestion.skillNodeId, skillNodeId),
          ne(TrainingKnowledgeItem.id, primary.id),
          eq(TrainingKnowledgeItem.status, "checked"),
          gte(TrainingKnowledgeItem.strength, RECALL_COMPANION_MIN_STRENGTH),
          isNotNull(TrainingKnowledgeItem.checkedAt),
          sql`${overdueRatio} < 1`,
        ),
      )
      .orderBy(...chainOrdering, desc(recallAnchor))
      .limit(1);

    return row ? mapRecallCandidate(row) : null;
  },

  /**
   * Applies one scored solve to the knowledge it was load-bearing for: a pass
   * earns a coverage rep. Skill mastery reads coverageCount against the target
   * (engine/concept-coverage.ts) — this counter, not a rating, is the
   * foundation-regime progress state.
   */
  incrementCoverage: async ({
    db,
    knowledgeIds,
  }: {
    db: Database;
    knowledgeIds: string[];
  }) => {
    if (knowledgeIds.length === 0) return;
    await db
      .update(TrainingKnowledgeItem)
      .set({
        coverageCount: sql`${TrainingKnowledgeItem.coverageCount} + 1`,
      })
      .where(inArray(TrainingKnowledgeItem.id, knowledgeIds));
  },

  /**
   * Applies one scored recall verdict to the composed entries: pass climbs a
   * strength rung, fail drops one (floored at zero). Stamps the anchor either
   * way so the spacing clock restarts from this verdict.
   */
  applyReinforcement: async ({
    db,
    knowledgeIds,
    passed,
    occurredAt,
  }: {
    db: Database;
    knowledgeIds: string[];
    passed: boolean;
    occurredAt: Date;
  }) => {
    if (knowledgeIds.length === 0) return;
    await db
      .update(TrainingKnowledgeItem)
      .set({
        strength: passed
          ? sql`${TrainingKnowledgeItem.strength} + 1`
          : sql`greatest(${TrainingKnowledgeItem.strength} - 1, 0)`,
        lastReinforcedAt: occurredAt,
      })
      .where(inArray(TrainingKnowledgeItem.id, knowledgeIds));
  },
};
