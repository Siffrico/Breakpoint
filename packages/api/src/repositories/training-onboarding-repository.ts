import type { db as databaseClient } from "@acme/db/client";
import type { StartingPointTier } from "@acme/validators";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "@acme/db";
import {
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
  TrainingOnboardingMessage,
  TrainingOnboardingSession,
  TrainingWorkspaceTurn,
} from "@acme/db/schema";

import type { AskStartingPointInput } from "../domain/training/agents/onboarding-chat-agent";
import type { CreateProjectInput } from "../domain/training/orchestration/build-project";
import type {
  IdentityReport,
  OnboardingQuestion,
  OnboardingSessionState,
  OnboardingTranscriptMessage,
} from "../domain/training/types/training.types";
import { workspaceLeaseExpiry } from "../domain/training/workspace-ai/workspace-lease";
import { buildProjectCheckpointRepository } from "./build-project-checkpoint-repository";

type Database = typeof databaseClient;

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
    startingPointQuestion?: AskStartingPointInput;
    projectProposal?: CreateProjectInput;
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

type WorkspaceTurnAction =
  | "start_unit"
  | "submit_answer"
  | "advance_pass"
  | "onboarding_chat";

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

  upsertMessageByTurnRole: async ({
    db,
    sessionId,
    role,
    content,
    slot,
    turnId,
    metadata,
  }: {
    db: Database;
    sessionId: string;
    role: "assistant" | "user";
    content: string;
    slot: string | null;
    turnId: string;
    metadata?: OnboardingMessageInsert["metadata"];
  }) => {
    const existing = await getMessageByTurnRole({
      db,
      sessionId,
      turnId,
      role,
    });
    if (existing) {
      const [updated] = await db
        .update(TrainingOnboardingMessage)
        .set({
          content,
          slot,
          ...(metadata !== undefined ? { metadata } : {}),
        })
        .where(eq(TrainingOnboardingMessage.id, existing.id))
        .returning();
      return updated ?? existing;
    }

    const inserted = await insertMessageWithNextSequence({
      db,
      input: { sessionId, role, content, slot, turnId, metadata },
    });
    if (!inserted || inserted.content === content) return inserted;

    const [updated] = await db
      .update(TrainingOnboardingMessage)
      .set({ content, slot })
      .where(eq(TrainingOnboardingMessage.id, inserted.id))
      .returning();
    return updated ?? inserted;
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
    // claimedAt is the turn row's original createdAt: lease reclaims and
    // failed-turn retries update the row without touching it, so it is the
    // first arrival of this turnId — the server-authoritative submission time.
    | { status: "claimed"; claimedAt: Date }
    | { status: "processing" }
    | {
        status: "completed";
        assistantMessage: WorkspaceMessage;
      }
  > => {
    const now = new Date();
    const leaseExpiresAt = workspaceLeaseExpiry(now);
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
            // A heartbeated lease that has gone stale had its owner die; an
            // unexpired one is still being served. Expiry alone decides.
            or(
              isNull(TrainingWorkspaceTurn.leaseExpiresAt),
              lt(TrainingWorkspaceTurn.leaseExpiresAt, now),
            ),
          ),
        )
        .returning({ id: TrainingWorkspaceTurn.id });

      return reclaimedTurn
        ? { status: "claimed", claimedAt: existingTurn.createdAt }
        : { status: "processing" };
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
      return retriedTurn
        ? { status: "claimed", claimedAt: existingTurn.createdAt }
        : { status: "processing" };
    }

    try {
      const [insertedTurn] = await db
        .insert(TrainingWorkspaceTurn)
        .values({
          sessionId,
          turnId,
          action,
          slot,
          unitId,
          inputContent: content,
          status: "processing",
          leaseId,
          leaseExpiresAt,
        })
        .returning({ createdAt: TrainingWorkspaceTurn.createdAt });
      return { status: "claimed", claimedAt: insertedTurn?.createdAt ?? now };
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

  renewOnboardingTurnLease: async ({
    db,
    sessionId,
    turnId,
    leaseId,
  }: {
    db: Database;
    sessionId: string;
    turnId: string;
    leaseId: string;
  }) => {
    const [renewed] = await db
      .update(TrainingWorkspaceTurn)
      .set({ leaseExpiresAt: workspaceLeaseExpiry() })
      .where(
        and(
          eq(TrainingWorkspaceTurn.sessionId, sessionId),
          eq(TrainingWorkspaceTurn.turnId, turnId),
          eq(TrainingWorkspaceTurn.status, "processing"),
          eq(TrainingWorkspaceTurn.leaseId, leaseId),
        ),
      )
      .returning({ id: TrainingWorkspaceTurn.id });

    return Boolean(renewed);
  },

  completeOnboardingTurn: async ({
    db,
    sessionId,
    turnId,
    leaseId,
    userMessageId,
    assistantMessageId,
  }: {
    db: Database;
    sessionId: string;
    turnId: string;
    leaseId: string;
    userMessageId: string | null;
    assistantMessageId: string;
  }) => {
    const [completed] = await db
      .update(TrainingWorkspaceTurn)
      .set({
        status: "completed",
        userMessageId,
        assistantMessageId,
        leaseId: null,
        leaseExpiresAt: null,
        failureReason: null,
      })
      .where(
        and(
          eq(TrainingWorkspaceTurn.sessionId, sessionId),
          eq(TrainingWorkspaceTurn.turnId, turnId),
          eq(TrainingWorkspaceTurn.status, "processing"),
          eq(TrainingWorkspaceTurn.leaseId, leaseId),
        ),
      )
      .returning({ id: TrainingWorkspaceTurn.id });

    return Boolean(completed);
  },

  failOnboardingTurn: async ({
    db,
    sessionId,
    turnId,
    leaseId,
    reason,
  }: {
    db: Database;
    sessionId: string;
    turnId: string;
    leaseId: string;
    reason: string;
  }) => {
    await db
      .update(TrainingWorkspaceTurn)
      .set({
        status: "failed",
        leaseId: null,
        leaseExpiresAt: null,
        failureReason: reason.slice(0, 2_000),
      })
      .where(
        and(
          eq(TrainingWorkspaceTurn.sessionId, sessionId),
          eq(TrainingWorkspaceTurn.turnId, turnId),
          eq(TrainingWorkspaceTurn.status, "processing"),
          eq(TrainingWorkspaceTurn.leaseId, leaseId),
        ),
      );
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

  listChatUnitIdsBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }) => {
    if (sessionIds.length === 0) return [];

    const rows = await db
      .selectDistinct({
        sessionId: TrainingOnboardingMessage.sessionId,
        unitId: TrainingOnboardingMessage.unitId,
      })
      .from(TrainingOnboardingMessage)
      .where(
        and(
          inArray(TrainingOnboardingMessage.sessionId, sessionIds),
          sql`${TrainingOnboardingMessage.unitId} is not null`,
          sql`${TrainingOnboardingMessage.metadata}->>'hiddenFromTranscript' is distinct from 'true'`,
        ),
      );

    return rows.flatMap((row) =>
      row.unitId ? [{ sessionId: row.sessionId, unitId: row.unitId }] : [],
    );
  },

  listWorkspaceMessagesByUnit: async ({
    db,
    sessionId,
    unitId,
  }: {
    db: Database;
    sessionId: string;
    unitId: string;
  }) => {
    const messages = await db.query.TrainingOnboardingMessage.findMany({
      where: and(
        eq(TrainingOnboardingMessage.sessionId, sessionId),
        eq(TrainingOnboardingMessage.unitId, unitId),
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

  getOnboardingState: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<OnboardingSessionState | null> => {
    const [
      session,
      transcript,
      projectBuildRun,
      startingPointMessage,
      proposalMessage,
    ] = await Promise.all([
      trainingOnboardingRepository.getSession({ db, sessionId }),
      trainingOnboardingRepository.listMessages({ db, sessionId }),
      buildProjectCheckpointRepository.getRun({ db, sessionId }),
      getMessageByTurnRole({
        db,
        sessionId,
        turnId: "onboarding-starting-point-question",
        role: "assistant",
      }),
      getMessageByTurnRole({
        db,
        sessionId,
        turnId: "onboarding-project-proposal",
        role: "assistant",
      }),
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
    const startingPointQuestion =
      startingPointMessage?.metadata?.startingPointQuestion;

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
      pendingStartingPointQuestion:
        session.startingPointTier == null &&
        startingPointMessage != null &&
        startingPointMessage.sequence === transcript.at(-1)?.sequence &&
        startingPointQuestion
          ? {
              sequence: startingPointMessage.sequence,
              input: startingPointQuestion,
            }
          : null,
      pendingProjectProposal:
        projectBuildRun == null &&
        proposalMessage?.sequence === transcript.at(-1)?.sequence
          ? ((proposalMessage?.metadata as OnboardingMessageInsert["metadata"])
              ?.projectProposal ?? null)
          : null,
    };
  },

  createProfileVersion: async ({
    db,
    sessionId,
    userId,
    report,
  }: {
    db: Database;
    sessionId: string;
    userId?: string | null;
    report: IdentityReport;
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
        qualityStandards: report.qualityStandards,
        behaviorSignals: report.behaviorSignals,
        confidenceFlags: report.confidenceFlags,
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
