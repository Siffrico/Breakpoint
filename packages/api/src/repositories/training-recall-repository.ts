import { and, asc, desc, eq, inArray, or } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  TrainingRecallGate,
  TrainingRecallProbe,
  TrainingUnitRecallState,
} from "@acme/db/schema";

import type {
  RecallGate,
  RecallGateStatus,
  RecallGateSummary,
  RecallProbe,
  RecallProbeStatus,
  RecallProbeType,
  UnitRecallState,
  UnitRecallStatus,
} from "../domain/training/types/training.types";

type Database = typeof databaseClient;

const mapProbe = (
  probe: typeof TrainingRecallProbe.$inferSelect,
): RecallProbe => ({
  id: probe.id,
  gateId: probe.gateId,
  probeOrder: probe.probeOrder,
  probeType: probe.probeType as RecallProbeType,
  sourceUnitNodeIds: probe.sourceUnitNodeIds,
  prompt: probe.prompt,
  seedSnapshot: probe.seedSnapshot,
  userResponse: probe.userResponse,
  score: probe.score,
  passed: probe.passed,
  repairPrompt: probe.repairPrompt,
  repairResponse: probe.repairResponse,
  repairScore: probe.repairScore,
  repairPassed: probe.repairPassed,
  status: probe.status as RecallProbeStatus,
  createdAt: probe.createdAt,
  updatedAt: probe.updatedAt ?? null,
  completedAt: probe.completedAt ?? null,
});

const mapState = (
  state: typeof TrainingUnitRecallState.$inferSelect,
): UnitRecallState => ({
  id: state.id,
  unitNodeId: state.unitNodeId,
  planId: state.planId,
  lastRecalledAt: state.lastRecalledAt ?? null,
  lastRecallOrderIndex: state.lastRecallOrderIndex ?? null,
  recallCount: state.recallCount,
  decayCount: state.decayCount,
  lastRecallScore: state.lastRecallScore ?? null,
  status: state.status as UnitRecallStatus,
  createdAt: state.createdAt,
  updatedAt: state.updatedAt ?? null,
});

const buildGateSummary = ({
  gate,
  probes,
}: {
  gate: typeof TrainingRecallGate.$inferSelect;
  probes: typeof TrainingRecallProbe.$inferSelect[];
}): RecallGateSummary => ({
  id: gate.id,
  status: gate.status as RecallGateStatus,
  triggerAfterUnitNodeId: gate.triggerAfterUnitNodeId,
  probeCount: probes.length,
  pendingProbeCount: probes.filter(
    (probe) => probe.status === "pending" || probe.status === "repair_pending",
  ).length,
});

const getGateWithProbes = async ({
  db,
  where,
}: {
  db: Database;
  where:
    | ReturnType<typeof eq>
    | ReturnType<typeof and>
     ;
}): Promise<RecallGate | null> => {
  const gate = await db.query.TrainingRecallGate.findFirst({
    where,
    orderBy: [desc(TrainingRecallGate.createdAt)],
  });

  if (!gate) {
    return null;
  }

  const probes = await db.query.TrainingRecallProbe.findMany({
    where: eq(TrainingRecallProbe.gateId, gate.id),
    orderBy: [asc(TrainingRecallProbe.probeOrder), asc(TrainingRecallProbe.createdAt)],
  });

  return {
    id: gate.id,
    planId: gate.planId,
    sessionId: gate.sessionId,
    userId: gate.userId ?? null,
    triggerAfterUnitNodeId: gate.triggerAfterUnitNodeId,
    status: gate.status as RecallGateStatus,
    probes: probes.map(mapProbe),
    createdAt: gate.createdAt,
    updatedAt: gate.updatedAt ?? null,
    completedAt: gate.completedAt ?? null,
  };
};

export const trainingRecallRepository = {
  createGate: async ({
    db,
    planId,
    sessionId,
    userId,
    triggerAfterUnitNodeId,
    status = "active",
  }: {
    db: Database;
    planId: string;
    sessionId: string;
    userId?: string | null;
    triggerAfterUnitNodeId: string;
    status?: RecallGateStatus;
  }) => {
    const [gate] = await db
      .insert(TrainingRecallGate)
      .values({
        planId,
        sessionId,
        userId: userId ?? null,
        triggerAfterUnitNodeId,
        status,
      })
      .onConflictDoNothing({
        target: [
          TrainingRecallGate.planId,
          TrainingRecallGate.triggerAfterUnitNodeId,
        ],
      })
      .returning();

    if (gate) {
      return gate;
    }

    return (
      (await db.query.TrainingRecallGate.findFirst({
        where: and(
          eq(TrainingRecallGate.planId, planId),
          eq(TrainingRecallGate.triggerAfterUnitNodeId, triggerAfterUnitNodeId),
        ),
      })) ?? null
    );
  },

  createProbes: async ({
    db,
    gateId,
    probes,
  }: {
    db: Database;
    gateId: string;
    probes: {
      probeOrder: number;
      probeType: RecallProbeType;
      sourceUnitNodeIds: string[];
      prompt: string;
      seedSnapshot?: string | null;
      status?: RecallProbeStatus;
    }[];
  }) => {
    const existing = await db.query.TrainingRecallProbe.findMany({
      where: eq(TrainingRecallProbe.gateId, gateId),
    });

    if (existing.length > 0) {
      return existing.map(mapProbe);
    }

    const created = await db
      .insert(TrainingRecallProbe)
      .values(
        probes.map((probe) => ({
          gateId,
          probeOrder: probe.probeOrder,
          probeType: probe.probeType,
          sourceUnitNodeIds: probe.sourceUnitNodeIds,
          prompt: probe.prompt,
          seedSnapshot: probe.seedSnapshot ?? null,
          status: probe.status ?? "pending",
        })),
      )
      .returning();

    return created.map(mapProbe);
  },

  getGateById: async ({
    db,
    gateId,
  }: {
    db: Database;
    gateId: string;
  }) =>
    getGateWithProbes({
      db,
      where: eq(TrainingRecallGate.id, gateId),
    }),

  getGateByTriggerUnit: async ({
    db,
    planId,
    triggerAfterUnitNodeId,
  }: {
    db: Database;
    planId: string;
    triggerAfterUnitNodeId: string;
  }) =>
    getGateWithProbes({
      db,
      where: and(
        eq(TrainingRecallGate.planId, planId),
        eq(TrainingRecallGate.triggerAfterUnitNodeId, triggerAfterUnitNodeId),
      ),
    }),

  getActiveGateBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) =>
    getGateWithProbes({
      db,
      where: and(
        eq(TrainingRecallGate.sessionId, sessionId),
        or(
          eq(TrainingRecallGate.status, "pending"),
          eq(TrainingRecallGate.status, "active"),
        ),
      ),
    }),

  getLatestResolvedGateBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) =>
    getGateWithProbes({
      db,
      where: and(
        eq(TrainingRecallGate.sessionId, sessionId),
        or(
          eq(TrainingRecallGate.status, "passed"),
          eq(TrainingRecallGate.status, "repaired"),
          eq(TrainingRecallGate.status, "flagged"),
        ),
      ),
    }),

  getActiveGateSummaryBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<RecallGateSummary | null> => {
    const gate = await db.query.TrainingRecallGate.findFirst({
      where: and(
        eq(TrainingRecallGate.sessionId, sessionId),
        or(
          eq(TrainingRecallGate.status, "pending"),
          eq(TrainingRecallGate.status, "active"),
        ),
      ),
      orderBy: [desc(TrainingRecallGate.createdAt)],
    });

    if (!gate) {
      return null;
    }

    const probes = await db.query.TrainingRecallProbe.findMany({
      where: eq(TrainingRecallProbe.gateId, gate.id),
    });

    return buildGateSummary({ gate, probes });
  },

  updateGate: async ({
    db,
    gateId,
    status,
    completedAt,
  }: {
    db: Database;
    gateId: string;
    status?: RecallGateStatus;
    completedAt?: Date | null;
  }) => {
    const [gate] = await db
      .update(TrainingRecallGate)
      .set({
        ...(status ? { status } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(TrainingRecallGate.id, gateId))
      .returning();

    return gate ?? null;
  },

  updateProbe: async ({
    db,
    probeId,
    userResponse,
    score,
    passed,
    repairPrompt,
    repairResponse,
    repairScore,
    repairPassed,
    status,
    completedAt,
  }: {
    db: Database;
    probeId: string;
    userResponse?: string | null;
    score?: number | null;
    passed?: boolean | null;
    repairPrompt?: string | null;
    repairResponse?: string | null;
    repairScore?: number | null;
    repairPassed?: boolean | null;
    status?: RecallProbeStatus;
    completedAt?: Date | null;
  }) => {
    const [probe] = await db
      .update(TrainingRecallProbe)
      .set({
        ...(userResponse !== undefined ? { userResponse } : {}),
        ...(score !== undefined ? { score } : {}),
        ...(passed !== undefined ? { passed } : {}),
        ...(repairPrompt !== undefined ? { repairPrompt } : {}),
        ...(repairResponse !== undefined ? { repairResponse } : {}),
        ...(repairScore !== undefined ? { repairScore } : {}),
        ...(repairPassed !== undefined ? { repairPassed } : {}),
        ...(status ? { status } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(TrainingRecallProbe.id, probeId))
      .returning();

    return probe ? mapProbe(probe) : null;
  },

  listRecallStates: async ({
    db,
    planId,
    unitNodeIds,
  }: {
    db: Database;
    planId: string;
    unitNodeIds: string[];
  }) => {
    if (unitNodeIds.length === 0) {
      return [];
    }

    const rows = await db.query.TrainingUnitRecallState.findMany({
      where: and(
        eq(TrainingUnitRecallState.planId, planId),
        inArray(TrainingUnitRecallState.unitNodeId, unitNodeIds),
      ),
    });

    return rows.map(mapState);
  },

  upsertRecallState: async ({
    db,
    unitNodeId,
    planId,
    lastRecalledAt,
    lastRecallOrderIndex,
    recallCount,
    decayCount,
    lastRecallScore,
    status,
  }: {
    db: Database;
    unitNodeId: string;
    planId: string;
    lastRecalledAt: Date | null;
    lastRecallOrderIndex: number | null;
    recallCount: number;
    decayCount: number;
    lastRecallScore: number | null;
    status: UnitRecallStatus;
  }) => {
    const [row] = await db
      .insert(TrainingUnitRecallState)
      .values({
        unitNodeId,
        planId,
        lastRecalledAt,
        lastRecallOrderIndex,
        recallCount,
        decayCount,
        lastRecallScore,
        status,
      })
      .onConflictDoUpdate({
        target: [
          TrainingUnitRecallState.unitNodeId,
          TrainingUnitRecallState.planId,
        ],
        set: {
          lastRecalledAt,
          lastRecallOrderIndex,
          recallCount,
          decayCount,
          lastRecallScore,
          status,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row ? mapState(row) : null;
  },
};
