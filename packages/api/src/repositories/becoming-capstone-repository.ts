import { and, asc, eq } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  BecomingCapstoneAttempt,
  BecomingCapstoneMessage,
} from "@acme/db/schema";

import type {
  CapstoneAttemptRecord,
  CapstoneMessageRecord,
  CapstoneScenario,
  CapstoneStatus,
} from "../domain/becoming/types/becoming.types";

type Database = typeof databaseClient;

const mapCapstoneAttempt = (
  attempt: typeof BecomingCapstoneAttempt.$inferSelect,
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
  message: typeof BecomingCapstoneMessage.$inferSelect,
): CapstoneMessageRecord => ({
  id: message.id,
  capstoneId: message.capstoneId,
  role: message.role as CapstoneMessageRecord["role"],
  content: message.content,
  sequence: message.sequence,
  round: message.round,
  createdAt: message.createdAt,
});

export const becomingCapstoneRepository = {
  getCapstoneByNodeId: async ({
    db,
    simulationNodeId,
    sessionId,
  }: {
    db: Database;
    simulationNodeId: string;
    sessionId: string;
  }): Promise<CapstoneAttemptRecord | null> => {
    const attempt = await db.query.BecomingCapstoneAttempt.findFirst({
      where: and(
        eq(BecomingCapstoneAttempt.simulationNodeId, simulationNodeId),
        eq(BecomingCapstoneAttempt.sessionId, sessionId),
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
      .insert(BecomingCapstoneAttempt)
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
          BecomingCapstoneAttempt.simulationNodeId,
          BecomingCapstoneAttempt.sessionId,
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
      .update(BecomingCapstoneAttempt)
      .set({
        status,
        currentRound,
        score,
        feedback,
        updatedAt: new Date(),
      })
      .where(eq(BecomingCapstoneAttempt.id, capstoneId))
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
    const messages = await db.query.BecomingCapstoneMessage.findMany({
      where: eq(BecomingCapstoneMessage.capstoneId, capstoneId),
      orderBy: [asc(BecomingCapstoneMessage.sequence)],
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
      .insert(BecomingCapstoneMessage)
      .values({
        capstoneId,
        role,
        content,
        sequence,
        round,
      })
      .onConflictDoUpdate({
        target: [
          BecomingCapstoneMessage.capstoneId,
          BecomingCapstoneMessage.sequence,
        ],
        set: {
          role,
          content,
          round,
        },
      })
      .returning();

    return message ? mapCapstoneMessage(message) : null;
  },
};
