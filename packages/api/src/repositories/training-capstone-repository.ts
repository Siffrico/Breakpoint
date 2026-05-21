import { and, asc, eq } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  TrainingCapstoneAttempt,
  TrainingCapstoneMessage,
} from "@acme/db/schema";

import type {
  CapstoneAttemptRecord,
  CapstoneMessageRecord,
  CapstoneScenario,
  CapstoneStatus,
} from "../domain/training/types/training.types";

type Database = typeof databaseClient;

const mapCapstoneAttempt = (
  attempt: typeof TrainingCapstoneAttempt.$inferSelect,
): CapstoneAttemptRecord => ({
  id: attempt.id,
  simulationNodeId: attempt.simulationNodeId,
  planId: attempt.planId,
  sessionId: attempt.sessionId,
  userId: attempt.userId,
  format: attempt.format as CapstoneAttemptRecord["format"],
  status: attempt.status as CapstoneStatus,
  scenario: attempt.scenario as CapstoneScenario,
  currentRound: attempt.currentRound,
  maxRounds: attempt.maxRounds,
  score: attempt.score,
  feedback: attempt.feedback,
  createdAt: attempt.createdAt,
  updatedAt: attempt.updatedAt ?? null,
});

const mapCapstoneMessage = (
  message: typeof TrainingCapstoneMessage.$inferSelect,
): CapstoneMessageRecord => ({
  id: message.id,
  capstoneId: message.capstoneId,
  role: message.role as CapstoneMessageRecord["role"],
  content: message.content,
  sequence: message.sequence,
  round: message.round,
  createdAt: message.createdAt,
});

export const trainingCapstoneRepository = {
  getCapstoneByNodeId: async ({
    db,
    simulationNodeId,
    sessionId,
  }: {
    db: Database;
    simulationNodeId: string;
    sessionId: string;
  }): Promise<CapstoneAttemptRecord | null> => {
    const attempt = await db.query.TrainingCapstoneAttempt.findFirst({
      where: and(
        eq(TrainingCapstoneAttempt.simulationNodeId, simulationNodeId),
        eq(TrainingCapstoneAttempt.sessionId, sessionId),
      ),
    });

    return attempt ? mapCapstoneAttempt(attempt) : null;
  },

  saveCapstone: async ({
    db,
    simulationNodeId,
    planId,
    sessionId,
    userId,
    scenario,
    status,
    maxRounds,
  }: {
    db: Database;
    simulationNodeId: string;
    planId: string;
    sessionId: string;
    userId?: string | null;
    scenario: CapstoneScenario;
    status?: CapstoneStatus;
    maxRounds: number;
  }): Promise<CapstoneAttemptRecord | null> => {
    const [attempt] = await db
      .insert(TrainingCapstoneAttempt)
      .values({
        simulationNodeId,
        planId,
        sessionId,
        userId: userId ?? null,
        format: scenario.format,
        status: status ?? "pending",
        scenario,
        currentRound: 0,
        maxRounds,
      })
      .onConflictDoUpdate({
        target: [
          TrainingCapstoneAttempt.simulationNodeId,
          TrainingCapstoneAttempt.sessionId,
        ],
        set: {
          userId: userId ?? null,
          format: scenario.format,
          status: status ?? "pending",
          scenario,
          maxRounds,
        },
      })
      .returning();

    return attempt ? mapCapstoneAttempt(attempt) : null;
  },

  updateCapstone: async ({
    db,
    capstoneId,
    status,
    currentRound,
    score,
    feedback,
  }: {
    db: Database;
    capstoneId: string;
    status?: CapstoneStatus;
    currentRound?: number;
    score?: number | null;
    feedback?: string | null;
  }): Promise<CapstoneAttemptRecord | null> => {
    const [attempt] = await db
      .update(TrainingCapstoneAttempt)
      .set({
        status,
        currentRound,
        score,
        feedback,
        updatedAt: new Date(),
      })
      .where(eq(TrainingCapstoneAttempt.id, capstoneId))
      .returning();

    return attempt ? mapCapstoneAttempt(attempt) : null;
  },

  listMessages: async ({
    db,
    capstoneId,
  }: {
    db: Database;
    capstoneId: string;
  }): Promise<CapstoneMessageRecord[]> => {
    const messages = await db.query.TrainingCapstoneMessage.findMany({
      where: eq(TrainingCapstoneMessage.capstoneId, capstoneId),
      orderBy: [asc(TrainingCapstoneMessage.sequence)],
    });

    return messages.map(mapCapstoneMessage);
  },

  appendMessage: async ({
    db,
    capstoneId,
    role,
    content,
    sequence,
    round,
  }: {
    db: Database;
    capstoneId: string;
    role: CapstoneMessageRecord["role"];
    content: string;
    sequence: number;
    round: number;
  }): Promise<CapstoneMessageRecord | null> => {
    const [message] = await db
      .insert(TrainingCapstoneMessage)
      .values({
        capstoneId,
        role,
        content,
        sequence,
        round,
      })
      .returning();

    return message ? mapCapstoneMessage(message) : null;
  },
};
