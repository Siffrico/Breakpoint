import type { db as databaseClient } from "@acme/db/client";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql } from "@acme/db";
import { TrainingCurriculumNode, TrainingSyllabusEntry } from "@acme/db/schema";

import type { SyllabusOutput } from "../domain/training/agents/contracts";
import type { RecallCandidateEntry } from "../domain/training/policies/recall-decay";
import {
  RECALL_COMPANION_MIN_STRENGTH,
  recallIntervalDaysFor,
} from "../domain/training/policies/recall-decay";

type Database = typeof databaseClient;

export const clampSyllabusEntryIds = ({
  requestedEntryIds,
  targetedEntryIds,
}: {
  requestedEntryIds: string[];
  targetedEntryIds: string[];
}) => {
  const allowed = new Set(targetedEntryIds);
  const uniqueRequested = [...new Set(requestedEntryIds)];
  return {
    accepted: uniqueRequested.filter((id) => allowed.has(id)),
    deferred: uniqueRequested.filter((id) => !allowed.has(id)),
  };
};

const listEntries = ({
  db,
  clusterNodeId,
}: {
  db: Database;
  clusterNodeId: string;
}) =>
  db.query.TrainingSyllabusEntry.findMany({
    where: eq(TrainingSyllabusEntry.clusterNodeId, clusterNodeId),
    orderBy: [asc(TrainingSyllabusEntry.orderIndex)],
  });

const recallCandidateSelection = {
  id: TrainingSyllabusEntry.id,
  clusterNodeId: TrainingSyllabusEntry.clusterNodeId,
  label: TrainingSyllabusEntry.label,
  gloss: TrainingSyllabusEntry.gloss,
  checkedAt: TrainingSyllabusEntry.checkedAt,
  strength: TrainingSyllabusEntry.strength,
  lastReinforcedAt: TrainingSyllabusEntry.lastReinforcedAt,
  evidenceNodeId: TrainingSyllabusEntry.evidenceNodeId,
};

interface RecallCandidateRow {
  id: string;
  clusterNodeId: string;
  label: string;
  gloss: string;
  checkedAt: Date | null;
  strength: number;
  lastReinforcedAt: Date | null;
  evidenceNodeId: string | null;
}

const mapRecallCandidate = (
  row: RecallCandidateRow,
): RecallCandidateEntry | null =>
  row.checkedAt
    ? {
        ...row,
        checkedAt: row.checkedAt,
      }
    : null;

// These SQL expressions must stay equivalent to recall-decay.ts: ordering in
// the database is what keeps candidate transfer bounded to one primary row.
const recallAnchor = sql`coalesce(${TrainingSyllabusEntry.lastReinforcedAt}, ${TrainingSyllabusEntry.checkedAt})`;
const recallIntervalSeconds = sql<number>`case
  when ${TrainingSyllabusEntry.strength} <= 0 then ${recallIntervalDaysFor(0) * 86_400}
  when ${TrainingSyllabusEntry.strength} = 1 then ${recallIntervalDaysFor(1) * 86_400}
  when ${TrainingSyllabusEntry.strength} = 2 then ${recallIntervalDaysFor(2) * 86_400}
  else ${recallIntervalDaysFor(3) * 86_400}
end`;
const recallOverdueRatio = (now: Date) =>
  sql<number>`extract(epoch from (${now}::timestamptz - ${recallAnchor})) / ${recallIntervalSeconds}`;

export const trainingSyllabusRepository = {
  ensureSyllabus: async ({
    db,
    clusterNodeId,
    entries,
    topicIdsBySlug,
  }: {
    db: Database;
    clusterNodeId: string;
    entries: SyllabusOutput["entries"];
    topicIdsBySlug?: ReadonlyMap<string, string>;
  }) =>
    db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      const unresolvedSlugs = [
        ...new Set(
          entries
            .map((entry) => entry.topicSlug)
            .filter(
              (slug): slug is string =>
                typeof slug === "string" && !topicIdsBySlug?.has(slug),
            ),
        ),
      ];
      if (unresolvedSlugs.length > 0) {
        console.warn("Syllabus entries reference unknown knowledge topics", {
          clusterNodeId,
          unresolvedSlugs,
        });
      }
      const existing = await listEntries({ db: transactionDb, clusterNodeId });
      if (existing.length > 0) return existing;

      await transactionDb
        .insert(TrainingSyllabusEntry)
        .values(
          entries.map((entry, orderIndex) => ({
            clusterNodeId,
            orderIndex,
            label: entry.label,
            kind: entry.kind,
            gloss: entry.gloss,
            mechanism: entry.mechanism,
            topicId: entry.topicSlug
              ? (topicIdsBySlug?.get(entry.topicSlug) ?? null)
              : null,
          })),
        )
        .onConflictDoNothing({
          target: [
            TrainingSyllabusEntry.clusterNodeId,
            TrainingSyllabusEntry.orderIndex,
          ],
        });

      return listEntries({ db: transactionDb, clusterNodeId });
    }),

  listEntries,

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
    // Skillset units (parent = ability) own no syllabus rows of their own —
    // their checked/targeted concepts live on the ability's child skills.
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
        ownerIds.map((clusterNodeId) => listEntries({ db, clusterNodeId })),
      )
    ).flat();
    return {
      clusterNodeId: cluster.id,
      workflow: cluster.skillMap.workflow,
      checked: entries
        .filter((entry) => entry.status === "checked")
        .map(({ label, gloss }) => ({ label, gloss })),
      targets: entries
        .filter((entry) => entry.status === "targeted")
        .map(({ id, label, gloss }) => ({ id, label, gloss })),
    };
  },

  // Scoped by entry id throughout: the targeted set may span multiple owning
  // skill nodes (skillset units), so a single clusterNodeId cannot scope it.
  checkOffEntries: async ({
    db,
    requestedEntryIds,
    targetedEntryIds,
    evidenceNodeId,
  }: {
    db: Database;
    requestedEntryIds: string[];
    targetedEntryIds: string[];
    evidenceNodeId: string;
  }) => {
    const { accepted: acceptedIds, deferred } = clampSyllabusEntryIds({
      requestedEntryIds,
      targetedEntryIds,
    });
    return db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      const checked =
        acceptedIds.length === 0
          ? []
          : await transactionDb
              .update(TrainingSyllabusEntry)
              .set({
                status: "checked",
                checkedAt: new Date(),
                evidenceNodeId,
              })
              .where(inArray(TrainingSyllabusEntry.id, acceptedIds))
              .returning({ id: TrainingSyllabusEntry.id });

      const checkedIds = checked.map((entry) => entry.id);
      const missing = acceptedIds.filter((id) => !checkedIds.includes(id));
      if (targetedEntryIds.length > 0) {
        await transactionDb
          .update(TrainingSyllabusEntry)
          .set({ status: "unchecked" })
          .where(
            and(
              inArray(TrainingSyllabusEntry.id, targetedEntryIds),
              eq(TrainingSyllabusEntry.status, "targeted"),
            ),
          );
      }
      return { checked: checkedIds, deferred: [...deferred, ...missing] };
    });
  },

  getRecallCandidatesByIds: async ({
    db,
    planId,
    entryIds,
  }: {
    db: Database;
    planId: string;
    entryIds: readonly string[];
  }): Promise<RecallCandidateEntry[]> => {
    if (entryIds.length === 0) return [];
    const rows = await db
      .select(recallCandidateSelection)
      .from(TrainingSyllabusEntry)
      .innerJoin(
        TrainingCurriculumNode,
        eq(TrainingCurriculumNode.id, TrainingSyllabusEntry.clusterNodeId),
      )
      .where(
        and(
          eq(TrainingCurriculumNode.planId, planId),
          eq(TrainingSyllabusEntry.status, "checked"),
          inArray(TrainingSyllabusEntry.id, [...entryIds]),
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
  }): Promise<RecallCandidateEntry | null> => {
    const overdueRatio = recallOverdueRatio(now);
    const [row] = await db
      .select(recallCandidateSelection)
      .from(TrainingSyllabusEntry)
      .innerJoin(
        TrainingCurriculumNode,
        eq(TrainingCurriculumNode.id, TrainingSyllabusEntry.clusterNodeId),
      )
      .where(
        and(
          eq(TrainingCurriculumNode.planId, planId),
          eq(TrainingSyllabusEntry.status, "checked"),
          isNotNull(TrainingSyllabusEntry.checkedAt),
          isNotNull(TrainingSyllabusEntry.evidenceNodeId),
          sql`${overdueRatio} >= 1`,
        ),
      )
      .orderBy(desc(overdueRatio))
      .limit(1);

    return row ? mapRecallCandidate(row) : null;
  },

  getRecallCompanionCandidate: async ({
    db,
    clusterNodeId,
    primaryEntryId,
    now,
  }: {
    db: Database;
    clusterNodeId: string;
    primaryEntryId: string;
    now: Date;
  }): Promise<RecallCandidateEntry | null> => {
    const overdueRatio = recallOverdueRatio(now);
    const [row] = await db
      .select(recallCandidateSelection)
      .from(TrainingSyllabusEntry)
      .where(
        and(
          eq(TrainingSyllabusEntry.clusterNodeId, clusterNodeId),
          ne(TrainingSyllabusEntry.id, primaryEntryId),
          eq(TrainingSyllabusEntry.status, "checked"),
          gte(TrainingSyllabusEntry.strength, RECALL_COMPANION_MIN_STRENGTH),
          isNotNull(TrainingSyllabusEntry.checkedAt),
          sql`${overdueRatio} < 1`,
        ),
      )
      .orderBy(desc(recallAnchor))
      .limit(1);

    return row ? mapRecallCandidate(row) : null;
  },

  /**
   * Applies one scored solve to the concepts it was load-bearing for: a pass
   * earns a coverage rep and stamps the support level it was earned at. Skill
   * mastery reads coverageCount against the target (engine/concept-coverage.ts)
   * — this counter, not a rating, is the foundation-regime progress state.
   */
  incrementCoverage: async ({
    db,
    entryIds,
    helpLevel,
  }: {
    db: Database;
    entryIds: string[];
    helpLevel: string;
  }) => {
    if (entryIds.length === 0) return;
    await db
      .update(TrainingSyllabusEntry)
      .set({
        coverageCount: sql`${TrainingSyllabusEntry.coverageCount} + 1`,
        lastHelpLevel: helpLevel,
      })
      .where(inArray(TrainingSyllabusEntry.id, entryIds));
  },

  /**
   * Applies one scored recall verdict to the composed entries: pass climbs a
   * strength rung, fail drops one (floored at zero). Stamps the anchor either
   * way so the spacing clock restarts from this verdict.
   */
  applyReinforcement: async ({
    db,
    entryIds,
    passed,
    occurredAt,
  }: {
    db: Database;
    entryIds: string[];
    passed: boolean;
    occurredAt: Date;
  }) => {
    if (entryIds.length === 0) return;
    await db
      .update(TrainingSyllabusEntry)
      .set({
        strength: passed
          ? sql`${TrainingSyllabusEntry.strength} + 1`
          : sql`greatest(${TrainingSyllabusEntry.strength} - 1, 0)`,
        lastReinforcedAt: occurredAt,
      })
      .where(inArray(TrainingSyllabusEntry.id, entryIds));
  },
};
