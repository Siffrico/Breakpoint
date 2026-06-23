import type { db as databaseClient } from "@acme/db/client";
import type { BeforeAfterProfile } from "@acme/validators";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "@acme/db";
import {
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
  TrainingOnboardingMessage,
  TrainingOnboardingSession,
  TrainingProjectBuildCheckpoint,
  TrainingWorkspaceTurn,
  TrainingWorkspaceSummary,
} from "@acme/db/schema";

import type {
  CreateProjectInput,
  ProjectBuildState,
} from "../domain/training/orchestration/build-project";
import type {
  IdentityReport,
  OnboardingQuestion,
  OnboardingSessionState,
  OnboardingTranscriptMessage,
} from "../domain/training/types/training.types";

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
  } | null;
}

// A project-build run's `updatedAt` only advances at claim time and at terminal
// states (never on step transitions), so it sits flat for the whole live build.
// A run still "building" past this window is therefore dead, not slow. This MUST
// stay greater than the chat route's `maxDuration` (300s) — see that route.
const STALE_BUILD_RECLAIM_MS = 360_000; // 6 min > 300s route ceiling

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

type ProjectBuildCheckpointStep = "run" | "goals" | "curriculum" | "overview";

interface ProjectBuildRunPayload {
  status: "building" | "complete" | "error";
  input: CreateProjectInput;
  state: ProjectBuildState;
  error?: string;
}

type WorkspaceTurnAction =
  | "submit_answer"
  | "next_scenario"
  | "adjust_difficulty";

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

const isProjectBuildRunPayload = (
  payload: unknown,
): payload is ProjectBuildRunPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "status" in payload &&
  (payload.status === "building" ||
    payload.status === "complete" ||
    payload.status === "error") &&
  "input" in payload &&
  "state" in payload;

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
  }: {
    db: Database;
    sessionId: string;
    action: WorkspaceTurnAction;
    content: string;
    slot: string | null;
    unitId?: string | null;
    turnId: string;
  }): Promise<
    | { status: "claimed" }
    | { status: "processing" }
    | {
        status: "completed";
        assistantMessage: WorkspaceMessage;
      }
  > => {
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
      return { status: "processing" };
    }

    if (existingTurn?.status === "failed") {
      await db
        .update(TrainingWorkspaceTurn)
        .set({
          action,
          slot,
          unitId,
          inputContent: content,
          status: "processing",
          failureReason: null,
        })
        .where(eq(TrainingWorkspaceTurn.id, existingTurn.id));
      return { status: "claimed" };
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

  // Most-recent onboarding session the user can still continue. A "complete"
  // session already produced a learning project (and redirects to /workspace),
  // so it must never be resumed back into onboarding.
  getLatestResumableSession: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }) => {
    const [session] = await db.query.TrainingOnboardingSession.findMany({
      where: and(
        eq(TrainingOnboardingSession.userId, userId),
        ne(TrainingOnboardingSession.status, "complete"),
      ),
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

  getProjectBuildCheckpoint: async ({
    db,
    sessionId,
    step,
    sourceKey,
  }: {
    db: Database;
    sessionId: string;
    step: ProjectBuildCheckpointStep;
    sourceKey: string;
  }) => {
    const checkpoint = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, step),
        eq(TrainingProjectBuildCheckpoint.sourceKey, sourceKey),
      ),
    });

    return checkpoint?.payload ?? null;
  },

  getProjectBuildRun: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const checkpoint = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });

    return isProjectBuildRunPayload(checkpoint?.payload)
      ? checkpoint.payload
      : null;
  },

  claimProjectBuildRun: async ({
    db,
    sessionId,
    sourceKey,
    payload,
  }: {
    db: Database;
    sessionId: string;
    sourceKey: string;
    payload: ProjectBuildRunPayload;
  }): Promise<
    | { status: "claimed" }
    | { status: "processing"; state: ProjectBuildState }
  > => {
    try {
      const [checkpoint] = await db
        .insert(TrainingProjectBuildCheckpoint)
        .values({
          sessionId,
          step: "run",
          sourceKey,
          payload,
        })
        .returning();

      void checkpoint;
      return { status: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    const existing = await db.query.TrainingProjectBuildCheckpoint.findFirst({
      where: and(
        eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
        eq(TrainingProjectBuildCheckpoint.step, "run"),
      ),
    });
    const existingPayload = isProjectBuildRunPayload(existing?.payload)
      ? existing.payload
      : null;

    // A live build holds the claim; only reclaim one that is provably dead.
    // The guarded UPDATE is race-free under READ COMMITTED: if two retries fire
    // at once, the loser re-checks `updatedAt` against the winner's freshly
    // bumped row, matches zero rows, and falls back to "processing".
    if (existingPayload?.status === "building") {
      const staleBefore = new Date(Date.now() - STALE_BUILD_RECLAIM_MS);
      const [reclaimed] = await db
        .update(TrainingProjectBuildCheckpoint)
        .set({ sourceKey, payload, updatedAt: new Date() })
        .where(
          and(
            eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
            eq(TrainingProjectBuildCheckpoint.step, "run"),
            lt(TrainingProjectBuildCheckpoint.updatedAt, staleBefore),
          ),
        )
        .returning();
      if (reclaimed) {
        return { status: "claimed" };
      }
      return { status: "processing", state: existingPayload.state };
    }

    const [checkpoint] = await db
      .update(TrainingProjectBuildCheckpoint)
      .set({
        sourceKey,
        payload,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
          eq(TrainingProjectBuildCheckpoint.step, "run"),
        ),
      )
      .returning();

    void checkpoint;
    return { status: "claimed" };
  },

  updateProjectBuildRun: async ({
    db,
    sessionId,
    sourceKey,
    payload,
  }: {
    db: Database;
    sessionId: string;
    sourceKey: string;
    payload: ProjectBuildRunPayload;
  }) => {
    const [checkpoint] = await db
      .update(TrainingProjectBuildCheckpoint)
      .set({
        sourceKey,
        payload,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(TrainingProjectBuildCheckpoint.sessionId, sessionId),
          eq(TrainingProjectBuildCheckpoint.step, "run"),
        ),
      )
      .returning();

    return checkpoint ?? null;
  },

  upsertProjectBuildCheckpoint: async ({
    db,
    sessionId,
    step,
    sourceKey,
    payload,
  }: {
    db: Database;
    sessionId: string;
    step: ProjectBuildCheckpointStep;
    sourceKey: string;
    payload: unknown;
  }) => {
    const [checkpoint] = await db
      .insert(TrainingProjectBuildCheckpoint)
      .values({
        sessionId,
        step,
        sourceKey,
        payload,
      })
      .onConflictDoUpdate({
        target: [
          TrainingProjectBuildCheckpoint.sessionId,
          TrainingProjectBuildCheckpoint.step,
        ],
        set: {
          sourceKey,
          payload,
          updatedAt: new Date(),
        },
      })
      .returning();

    return checkpoint ?? null;
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
      trainingOnboardingRepository.getProjectBuildRun({ db, sessionId }),
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
