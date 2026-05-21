import { and, asc, desc, eq, inArray } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
  TrainingOnboardingMessage,
  TrainingOnboardingSession,
} from "@acme/db/schema";

import type {
  IdentityReport,
  OnboardingQuestion,
  OnboardingSessionState,
  OnboardingTranscriptMessage,
} from "../domain/training/types/training.types";
import type { BeforeAfterProfile } from "@acme/validators";

type Database = typeof databaseClient;

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
    const existingCount = await db.query.TrainingOnboardingMessage.findMany({
      where: eq(TrainingOnboardingMessage.sessionId, sessionId),
      columns: { id: true },
    });

    const [message] = await db
      .insert(TrainingOnboardingMessage)
      .values({
        sessionId,
        role,
        content,
        slot,
        sequence: existingCount.length,
      })
      .returning();

    return message ?? null;
  },

  appendWorkspaceMessage: async ({
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
    const existingCount = await db.query.TrainingOnboardingMessage.findMany({
      where: eq(TrainingOnboardingMessage.sessionId, sessionId),
      columns: { id: true },
    });

    const [message] = await db
      .insert(TrainingOnboardingMessage)
      .values({
        sessionId,
        role,
        content,
        slot,
        sequence: existingCount.length,
      })
      .returning();

    return message
      ? {
          role: message.role as "assistant" | "user",
          content: message.content,
          sequence: message.sequence,
          slot: message.slot,
        }
      : null;
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
      orderBy: [desc(TrainingOnboardingSession.updatedAt), desc(TrainingOnboardingSession.createdAt)],
    }),

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

    return messages.map((message) => ({
      role: message.role as "assistant" | "user",
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

    return messages.map((message) => ({
      role: message.role as "assistant" | "user",
      content: message.content,
      sequence: message.sequence,
      slot: message.slot,
    }));
  },

  getOnboardingState: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<OnboardingSessionState | null> => {
    const [session, transcript] = await Promise.all([
      trainingOnboardingRepository.getSession({ db, sessionId }),
      trainingOnboardingRepository.listMessages({ db, sessionId }),
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
            sequence: transcript.filter((message) => message.role === "assistant").length - 1,
          }
        : null;

    return {
      sessionId,
      phase:
        session.status === "ready_for_generation" || session.status === "complete"
          ? "ready_for_generation"
          : session.status === "questioning"
            ? "questioning"
            : "intro",
      transcript,
      activeQuestion,
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

    return profile && version ? { profile, version } : null;
  },

  listProfilesBySessionIds: async ({
    db,
    sessionIds,
  }: {
    db: Database;
    sessionIds: string[];
  }) => {
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

    const versionsById = new Map(versions.map((version) => [version.id, version]));

    return profiles.flatMap((profile) => {
      const version = profile.currentVersionId
        ? versionsById.get(profile.currentVersionId) ?? null
        : null;

      return version ? [{ profile, version }] : [];
    });
  },
};
