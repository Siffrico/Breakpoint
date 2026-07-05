import type { db as databaseClient } from "@acme/db/client";
import type { BeforeAfterProfile, StartingPointTier } from "@acme/validators";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "@acme/db";
import {
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
  TrainingOnboardingMessage,
  TrainingOnboardingSession,
  TrainingWorkspaceSummary,
  TrainingWorkspaceTurn,
} from "@acme/db/schema";

import type {
  IdentityReport,
  OnboardingQuestion,
  OnboardingSessionState,
  OnboardingTranscriptMessage,
} from "../domain/training/types/training.types";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";

type Database = typeof databaseClient;
const WORKSPACE_TURN_LEASE_MS = 15 * 60 * 1_000;

const getWorkspaceTurnLeaseExpiry = (now = new Date()) =>
  new Date(now.getTime() + WORKSPACE_TURN_LEASE_MS);

interface OnboardingMessageInsert {
  sessionId: string;
  role: "assistant" | "user";
  content: string;
  slot: string | null;
  unitId?: string | null;
  turnId?: string | null;
  metadata?: {
    difficultyDirectiveReason?: string;
    hiddenFromTranscript?: boolean;
  } | null;
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

const getNextMessageSequence = async ({
  db,
  sessionId,
}: {
  db: Database;
  sessionId: string;
}) => {
  const [row] = await db
    .select({
      sequence: sql<number>`coalesce(max(${TrainingOnboardingMessage.sequence}), -1) + 1`,
    })
    .from(TrainingOnboardingMessage)
    .where(eq(TrainingOnboardingMessage.sessionId, sessionId));

  return row?.sequence ?? 0;
};

const mapWorkspaceMessage = (
  message: typeof TrainingOnboardingMessage.$inferSelect,
) => ({
  id: message.id,
  role: message.role as "assistant" | "user",
  content: message.content,
  sequence: message.sequence,
  slot: message.slot,
  unitId: message.unitId,
  turnId: message.turnId,
  metadata: message.metadata as OnboardingMessageInsert["metadata"],
});

type WorkspaceMessage = ReturnType<typeof mapWorkspaceMessage>;

type WorkspaceTurnAction = "submit_answer";

const getMessageByTurnRole = async ({
  db,
  sessionId,
  turnId,
  role,
}: {
  db: Database;
  sessionId: string;
  turnId: string;
  role: "assistant" | "user";
}) =>
  (await db.query.TrainingOnboardingMessage.findFirst({
    where: and(
      eq(TrainingOnboardingMessage.sessionId, sessionId),
      eq(TrainingOnboardingMessage.turnId, turnId),
      eq(TrainingOnboardingMessage.role, role),
    ),
  })) ?? null;

const getMessageById = async ({
  db,
  messageId,
}: {
  db: Database;
  messageId: string;
}) =>
  (await db.query.TrainingOnboardingMessage.findFirst({
    where: eq(TrainingOnboardingMessage.id, messageId),
  })) ?? null;

const insertMessageWithNextSequence = async ({
  db,
  input,
}: {
  db: Database;
  input: OnboardingMessageInsert;
}) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sequence = await getNextMessageSequence({
      db,
      sessionId: input.sessionId,
    });

    try {
      const [message] = await db
        .insert(TrainingOnboardingMessage)
        .values({
          ...input,
          sequence,
        })
        .returning();

      return message ?? null;
    } catch (error) {
      if (isUniqueViolation(error) && input.turnId) {
        const existing = await getMessageByTurnRole({
          db,
          sessionId: input.sessionId,
          turnId: input.turnId,
          role: input.role,
        });
        if (existing) {
          return existing;
        }
      }

      if (!isUniqueViolation(error) || attempt === 2) {
        throw error;
      }
    }
  }

  return null;
};

const isTranscriptVisibleMessage = (message: WorkspaceMessage) =>
  message.metadata?.hiddenFromTranscript !== true;

export const trainingOnboardingRepository = {
  createSession: async ({
    db,
    userId,
  }: {
    db: Database;
    userId?: string | null;
  }) => {
    const [session] = await db
      .insert(TrainingOnboardingSession)
      .values({
        userId: userId ?? null,
        status: "intro",
      })
      .returning();

    return session ?? null;
  },

  touchSession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const [session] = await db
      .update(TrainingOnboardingSession)
      .set({ updatedAt: new Date() })
      .where(eq(TrainingOnboardingSession.id, sessionId))
      .returning();

    return session ?? null;
  },

  appendMessage: async ({
    db,
    sessionId,
    role,
    content,
    slot,
  }: {
    db: Database;
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
  }) => {
    const message = await insertMessageWithNextSequence({
      db,
      input: {
        sessionId,
        role,
        content,
        slot,
      },
    });

    return message ?? null;
  },

  appendWorkspaceMessage: async ({
    db,
    sessionId,
    role,
    content,
    slot,
    unitId = null,
    turnId = null,
    metadata = null,
  }: {
    db: Database;
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId?: string | null;
    metadata?: {
      difficultyDirectiveReason?: string;
      hiddenFromTranscript?: boolean;
    } | null;
  }) => {
    if (turnId) {
      const existing = await getMessageByTurnRole({
        db,
        sessionId,
        turnId,
        role,
      });
      if (existing) {
        return mapWorkspaceMessage(existing);
      }
    }

    const message = await insertMessageWithNextSequence({
      db,
      input: {
        sessionId,
        role,
        content,
        slot,
        unitId,
        turnId,
        metadata,
      },
    });

    return message ? mapWorkspaceMessage(message) : null;
  },

  claimWorkspaceTurn: async ({
    db,
    sessionId,
    action,
    content,
    slot,
    unitId = null,
    turnId,
    leaseId,
  }: {
    db: Database;
    sessionId: string;
    action: WorkspaceTurnAction;
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId: string;
    leaseId: string;
  }): Promise<
    | { status: "claimed" }
    | { status: "processing" }
    | {
        status: "completed";
        assistantMessage: WorkspaceMessage;
      }
  > => {
    const now = new Date();
    const leaseExpiresAt = getWorkspaceTurnLeaseExpiry(now);
    const existingTurn = await db.query.TrainingWorkspaceTurn.findFirst({
      where: and(
        eq(TrainingWorkspaceTurn.sessionId, sessionId),
        eq(TrainingWorkspaceTurn.turnId, turnId),
      ),
    });

    if (existingTurn?.status === "completed") {
      const assistant = existingTurn.assistantMessageId
        ? await getMessageById({
            db,
            messageId: existingTurn.assistantMessageId,
          })
        : null;
      if (assistant) {
        return {
          status: "completed",
          assistantMessage: mapWorkspaceMessage(assistant),
        };
      }
    }

    if (existingTurn?.status === "processing") {
      const [reclaimedTurn] = await db
        .update(TrainingWorkspaceTurn)
        .set({
          action,
          slot,
          unitId,
          inputContent: content,
          leaseId,
          leaseExpiresAt,
          failureReason: null,
        })
        .where(
          and(
            eq(TrainingWorkspaceTurn.id, existingTurn.id),
            eq(TrainingWorkspaceTurn.status, "processing"),
            or(
              isNull(TrainingWorkspaceTurn.leaseExpiresAt),
              lt(TrainingWorkspaceTurn.leaseExpiresAt, now),
            ),
          ),
        )
        .returning({ id: TrainingWorkspaceTurn.id });

      return reclaimedTurn ? { status: "claimed" } : { status: "processing" };
    }

    if (existingTurn?.status === "failed") {
      const [retriedTurn] = await db
        .update(TrainingWorkspaceTurn)
        .set({
          action,
          slot,
          unitId,
          inputContent: content,
          status: "processing",
          leaseId,
          leaseExpiresAt,
          failureReason: null,
        })
        .where(
          and(
            eq(TrainingWorkspaceTurn.id, existingTurn.id),
            eq(TrainingWorkspaceTurn.status, "failed"),
          ),
        )
        .returning({ id: TrainingWorkspaceTurn.id });
      return retriedTurn ? { status: "claimed" } : { status: "processing" };
    }

    try {
      await db.insert(TrainingWorkspaceTurn).values({
        sessionId,
        turnId,
        action,
        slot,
        unitId,
        inputContent: content,
        status: "processing",
        leaseId,
        leaseExpiresAt,
      });
      return { status: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      const racedTurn = await db.query.TrainingWorkspaceTurn.findFirst({
        where: and(
          eq(TrainingWorkspaceTurn.sessionId, sessionId),
          eq(TrainingWorkspaceTurn.turnId, turnId),
        ),
      });

      if (racedTurn?.status === "completed" && racedTurn.assistantMessageId) {
        const assistant = await getMessageById({
          db,
          messageId: racedTurn.assistantMessageId,
        });
        if (assistant) {
          return {
            status: "completed",
            assistantMessage: mapWorkspaceMessage(assistant),
          };
        }
      }

      return { status: "processing" };
    }
  },

  getSession: async ({ db, sessionId }: { db: Database; sessionId: string }) =>
    (await db.query.TrainingOnboardingSession.findFirst({
      where: eq(TrainingOnboardingSession.id, sessionId),
    })) ?? null,

  listSessionsByUser: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }) =>
    db.query.TrainingOnboardingSession.findMany({
      where: eq(TrainingOnboardingSession.userId, userId),
      orderBy: [
        desc(TrainingOnboardingSession.updatedAt),
        desc(TrainingOnboardingSession.createdAt),
      ],
    }),

  listFirstUserMessagesBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }) => {
    if (sessionIds.length === 0) return [];

    const messages = await db
      .select({
        sessionId: TrainingOnboardingMessage.sessionId,
        content: TrainingOnboardingMessage.content,
        sequence: TrainingOnboardingMessage.sequence,
      })
      .from(TrainingOnboardingMessage)
      .where(
        and(
          inArray(TrainingOnboardingMessage.sessionId, sessionIds),
          eq(TrainingOnboardingMessage.role, "user"),
          isNull(TrainingOnboardingMessage.unitId),
        ),
      )
      .orderBy(
        asc(TrainingOnboardingMessage.sessionId),
        asc(TrainingOnboardingMessage.sequence),
      );

    const firstMessageBySessionId = new Map<string, string>();
    for (const message of messages) {
      if (!firstMessageBySessionId.has(message.sessionId)) {
        firstMessageBySessionId.set(message.sessionId, message.content);
      }
    }

    return Array.from(firstMessageBySessionId, ([sessionId, content]) => ({
      sessionId,
      content,
    }));
  },

  // Most recent session for restoring the onboarding screen. Completed sessions
  // are included by default so a reload cannot discard the finished build card;
  // callers starting an explicitly new project skip this lookup entirely.
  getLatestOnboardingSession: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }) => {
    const [session] = await db.query.TrainingOnboardingSession.findMany({
      where: eq(TrainingOnboardingSession.userId, userId),
      orderBy: [
        desc(TrainingOnboardingSession.updatedAt),
        desc(TrainingOnboardingSession.createdAt),
      ],
      limit: 1,
    });

    return session ?? null;
  },

  deleteSessionByUser: async ({
    db,
    sessionId,
    userId,
  }: {
    db: Database;
    sessionId: string;
    userId: string;
  }) => {
    const [session] = await db
      .delete(TrainingOnboardingSession)
      .where(
        and(
          eq(TrainingOnboardingSession.id, sessionId),
          eq(TrainingOnboardingSession.userId, userId),
        ),
      )
      .returning({ id: TrainingOnboardingSession.id });

    return session ?? null;
  },

  updateSession: async ({
    db,
    sessionId,
    status,
    questionCount,
    completedAt,
  }: {
    db: Database;
    sessionId: string;
    status?: string;
    questionCount?: number;
    completedAt?: Date | null;
  }) => {
    const [session] = await db
      .update(TrainingOnboardingSession)
      .set({
        status,
        questionCount,
        completedAt,
      })
      .where(eq(TrainingOnboardingSession.id, sessionId))
      .returning();

    return session ?? null;
  },

  setStartingPoint: async ({
    db,
    sessionId,
    tier,
    label,
  }: {
    db: Database;
    sessionId: string;
    tier: StartingPointTier;
    label: string;
  }) => {
    const [session] = await db
      .update(TrainingOnboardingSession)
      .set({
        startingPointTier: tier,
        startingPointLabel: label,
      })
      .where(eq(TrainingOnboardingSession.id, sessionId))
      .returning();

    return session ?? null;
  },

  setInitialStartingPoint: async ({
    db,
    sessionId,
    tier,
    label,
  }: {
    db: Database;
    sessionId: string;
    tier: StartingPointTier;
    label: string;
  }) => {
    const [session] = await db
      .update(TrainingOnboardingSession)
      .set({
        startingPointTier: tier,
        startingPointLabel: label,
      })
      .where(
        and(
          eq(TrainingOnboardingSession.id, sessionId),
          isNull(TrainingOnboardingSession.startingPointTier),
        ),
      )
      .returning();

    return session ?? null;
  },

  listMessages: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<OnboardingTranscriptMessage[]> => {
    const messages = await db.query.TrainingOnboardingMessage.findMany({
      where: eq(TrainingOnboardingMessage.sessionId, sessionId),
      orderBy: asc(TrainingOnboardingMessage.sequence),
    });

    return messages
      .map(mapWorkspaceMessage)
      .filter(isTranscriptVisibleMessage)
      .map((message) => ({
        role: message.role,
        content: message.content,
        sequence: message.sequence,
        slot: (message.slot as OnboardingTranscriptMessage["slot"]) ?? null,
      }));
  },

  listWorkspaceMessages: async ({
    db,
    sessionId,
    slot,
  }: {
    db: Database;
    sessionId: string;
    slot?: string | null;
  }) => {
    const messages = await db.query.TrainingOnboardingMessage.findMany({
      where:
        slot == null
          ? eq(TrainingOnboardingMessage.sessionId, sessionId)
          : and(
              eq(TrainingOnboardingMessage.sessionId, sessionId),
              eq(TrainingOnboardingMessage.slot, slot),
            ),
      orderBy: asc(TrainingOnboardingMessage.sequence),
    });

    return messages.map(mapWorkspaceMessage).filter(isTranscriptVisibleMessage);
  },

  listWorkspaceMessagesByTurnId: async ({
    db,
    sessionId,
    turnId,
  }: {
    db: Database;
    sessionId: string;
    turnId: string;
  }) => {
    const messages = await db.query.TrainingOnboardingMessage.findMany({
      where: and(
        eq(TrainingOnboardingMessage.sessionId, sessionId),
        eq(TrainingOnboardingMessage.turnId, turnId),
      ),
      orderBy: asc(TrainingOnboardingMessage.sequence),
    });

    return messages.map(mapWorkspaceMessage);
  },

  getWorkspaceSummary: async ({
    db,
    sessionId,
    slot,
  }: {
    db: Database;
    sessionId: string;
    slot: string;
  }): Promise<{
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  } | null> => {
    const row = await db.query.TrainingWorkspaceSummary.findFirst({
      where: and(
        eq(TrainingWorkspaceSummary.sessionId, sessionId),
        eq(TrainingWorkspaceSummary.slot, slot),
      ),
    });

    if (!row) return null;
    return {
      summary: row.summary,
      coveredThroughUnitId: row.coveredThroughUnitId,
      coveredThroughSequence: row.coveredThroughSequence,
    };
  },

  upsertWorkspaceSummary: async ({
    db,
    sessionId,
    slot,
    summary,
    coveredThroughUnitId,
    coveredThroughSequence,
  }: {
    db: Database;
    sessionId: string;
    slot: string;
    summary: string;
    coveredThroughUnitId: string | null;
    coveredThroughSequence: number | null;
  }): Promise<void> => {
    await db
      .insert(TrainingWorkspaceSummary)
      .values({
        sessionId,
        slot,
        summary,
        coveredThroughUnitId,
        coveredThroughSequence,
      })
      .onConflictDoUpdate({
        target: [
          TrainingWorkspaceSummary.sessionId,
          TrainingWorkspaceSummary.slot,
        ],
        set: {
          summary,
          coveredThroughUnitId,
          coveredThroughSequence,
          updatedAt: new Date(),
        },
      });
  },

  getOnboardingState: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<OnboardingSessionState | null> => {
    const [session, transcript, projectBuildRun] = await Promise.all([
      trainingOnboardingRepository.getSession({ db, sessionId }),
      trainingOnboardingRepository.listMessages({ db, sessionId }),
      buildProjectCheckpointRepository.getRun({ db, sessionId }),
    ]);

    if (!session) {
      return null;
    }

    const lastAssistantMessage =
      transcript
        .slice()
        .reverse()
        .find((message) => message.role === "assistant") ?? null;

    const activeQuestion: OnboardingQuestion | null =
      session.status === "questioning" && lastAssistantMessage
        ? {
            slot: lastAssistantMessage.slot ?? "target_identity",
            prompt: lastAssistantMessage.content,
            helper: null,
            sequence:
              transcript.filter((message) => message.role === "assistant")
                .length - 1,
          }
        : null;

    return {
      sessionId,
      phase:
        session.status === "ready_for_generation" ||
        session.status === "complete"
          ? "ready_for_generation"
          : session.status === "questioning"
            ? "questioning"
            : "intro",
      transcript,
      activeQuestion,
      projectBuild: projectBuildRun?.state ?? null,
    };
  },

  createProfileVersion: async ({
    db,
    sessionId,
    userId,
    report,
    beforeAfter,
  }: {
    db: Database;
    sessionId: string;
    userId?: string | null;
    report: IdentityReport;
    beforeAfter: BeforeAfterProfile;
  }) => {
    const [profile] = await db
      .insert(TrainingIdentityProfile)
      .values({
        userId: userId ?? null,
        onboardingSessionId: sessionId,
        status: "active",
        targetIdentity: report.targetIdentity,
        headline: report.headline,
      })
      .returning();

    if (!profile) {
      return null;
    }

    const [version] = await db
      .insert(TrainingIdentityProfileVersion)
      .values({
        profileId: profile.id,
        targetIdentity: report.targetIdentity,
        headline: report.headline,
        motivation: report.motivation,
        currentBaseline: report.currentBaseline,
        proofOfProgress: report.proofOfProgress,
        hardMoments: report.hardMoments,
        constraints: report.constraints,
        behaviorSignals: report.behaviorSignals,
        confidenceFlags: report.confidenceFlags,
        beforeAfterHeadline: beforeAfter.headline,
        beforeStateSummary: beforeAfter.beforeSummary,
        afterStateSummary: beforeAfter.afterSummary,
        beforeAfterContrastPairs: beforeAfter.contrastPairs,
        firstShift: beforeAfter.firstShift,
      })
      .returning();

    if (!version) {
      return null;
    }

    await db
      .update(TrainingIdentityProfile)
      .set({ currentVersionId: version.id })
      .where(eq(TrainingIdentityProfile.id, profile.id));

    return { profile, version };
  },

  getProfileBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const profile = await db.query.TrainingIdentityProfile.findFirst({
      where: eq(TrainingIdentityProfile.onboardingSessionId, sessionId),
    });

    if (!profile?.currentVersionId) {
      return null;
    }

    const version = await db.query.TrainingIdentityProfileVersion.findFirst({
      where: eq(TrainingIdentityProfileVersion.id, profile.currentVersionId),
    });

    return version ? { profile, version } : null;
  },

  listProfilesBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }): Promise<
    {
      profile: typeof TrainingIdentityProfile.$inferSelect;
      version: typeof TrainingIdentityProfileVersion.$inferSelect;
    }[]
  > => {
    if (sessionIds.length === 0) {
      return [];
    }

    const profiles = await db.query.TrainingIdentityProfile.findMany({
      where: inArray(TrainingIdentityProfile.onboardingSessionId, sessionIds),
    });

    const versionIds = profiles
      .map((profile) => profile.currentVersionId)
      .filter((versionId): versionId is string => versionId != null);

    const versions = versionIds.length
      ? await db.query.TrainingIdentityProfileVersion.findMany({
          where: inArray(TrainingIdentityProfileVersion.id, versionIds),
        })
      : [];

    const versionsById = new Map(
      versions.map((version) => [version.id, version]),
    );

    return profiles.flatMap((profile) => {
      const version = profile.currentVersionId
        ? (versionsById.get(profile.currentVersionId) ?? null)
        : null;

      return version ? [{ profile, version }] : [];
    });
  },
};
