import type { db as databaseClient } from "@acme/db/client";
import { and, asc, eq, inArray } from "@acme/db";
import { TrainingSyllabusEntry } from "@acme/db/schema";

import type { SyllabusOutput } from "../domain/training/agents/contracts";

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

export const trainingSyllabusRepository = {
  ensureSyllabus: async ({
    db,
    clusterNodeId,
    entries,
  }: {
    db: Database;
    clusterNodeId: string;
    entries: SyllabusOutput["entries"];
  }) =>
    db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
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

  checkOffEntries: async ({
    db,
    clusterNodeId,
    requestedEntryIds,
    targetedEntryIds,
    evidenceNodeId,
  }: {
    db: Database;
    clusterNodeId: string;
    requestedEntryIds: string[];
    targetedEntryIds: string[];
    evidenceNodeId: string;
  }) => {
    const { accepted: acceptedIds, deferred } = clampSyllabusEntryIds({
      requestedEntryIds,
      targetedEntryIds,
    });
    if (acceptedIds.length === 0) return { checked: [], deferred };

    return db.transaction(async (tx) => {
      const transactionDb = tx as unknown as Database;
      const checked = await transactionDb
        .update(TrainingSyllabusEntry)
        .set({
          status: "checked",
          checkedAt: new Date(),
          evidenceNodeId,
        })
        .where(
          and(
            eq(TrainingSyllabusEntry.clusterNodeId, clusterNodeId),
            inArray(TrainingSyllabusEntry.id, acceptedIds),
          ),
        )
        .returning({ id: TrainingSyllabusEntry.id });

      const checkedIds = checked.map((entry) => entry.id);
      const missing = acceptedIds.filter((id) => !checkedIds.includes(id));
      return { checked: checkedIds, deferred: [...deferred, ...missing] };
    });
  },
};
