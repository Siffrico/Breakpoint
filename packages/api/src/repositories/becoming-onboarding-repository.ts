import { asc, desc, eq, inArray } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  BecomingIdentityProfile,
  BecomingIdentityProfileVersion,
  BecomingOnboardingMessage,
  BecomingOnboardingSession,
} from "@acme/db/schema";

import type {
  IdentityReport,
  OnboardingQuestion,
  OnboardingSessionState,
  OnboardingTranscriptMessage,
} from "../domain/becoming/types/becoming.types";
import type { BeforeAfterProfile } from "@acme/validators";

type Database = typeof databaseClient;

export const becomingOnboardingRepository = {
  createSession: async ({
    db,
    userId,
  }: {
    db: Database;
    userId?: string | null;
  }) => {
    const [session] = await db
      .insert(BecomingOnboardingSession)
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
      .update(BecomingOnboardingSession)
      .set({ updatedAt: new Date() })
      .where(eq(BecomingOnboardingSession.id, sessionId))
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
    const existingCount = await db.query.BecomingOnboardingMessage.findMany({
      where: eq(BecomingOnboardingMessage.sessionId, sessionId),
      columns: { id: true },
    });

    const [message] = await db
      .insert(BecomingOnboardingMessage)
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
    const existingCount = await db.query.BecomingOnboardingMessage.findMany({
      where: eq(BecomingOnboardingMessage.sessionId, sessionId),
      columns: { id: true },
    });

    const [message] = await db
      .insert(BecomingOnboardingMessage)
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
    (await db.query.BecomingOnboardingSession.findFirst({
      where: eq(BecomingOnboardingSession.id, sessionId),
    })) ?? null,

  listSessionsByUser: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }) =>
    db.query.BecomingOnboardingSession.findMany({
      where: eq(BecomingOnboardingSession.userId, userId),
      orderBy: [desc(BecomingOnboardingSession.updatedAt), desc(BecomingOnboardingSession.createdAt)],
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
      .update(BecomingOnboardingSession)
      .set({
        status,
        questionCount,
        completedAt,
      })
      .where(eq(BecomingOnboardingSession.id, sessionId))
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
    const messages = await db.query.BecomingOnboardingMessage.findMany({
      where: eq(BecomingOnboardingMessage.sessionId, sessionId),
      orderBy: asc(BecomingOnboardingMessage.sequence),
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
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const messages = await db.query.BecomingOnboardingMessage.findMany({
      where: eq(BecomingOnboardingMessage.sessionId, sessionId),
      orderBy: asc(BecomingOnboardingMessage.sequence),
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
      becomingOnboardingRepository.getSession({ db, sessionId }),
      becomingOnboardingRepository.listMessages({ db, sessionId }),
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
      .insert(BecomingIdentityProfile)
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
      .insert(BecomingIdentityProfileVersion)
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
      .update(BecomingIdentityProfile)
      .set({ currentVersionId: version.id })
      .where(eq(BecomingIdentityProfile.id, profile.id));

    return { profile, version };
  },

  getProfileBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }) => {
    const profile = await db.query.BecomingIdentityProfile.findFirst({
      where: eq(BecomingIdentityProfile.onboardingSessionId, sessionId),
    });

    if (!profile?.currentVersionId) {
      return null;
    }

    const version = await db.query.BecomingIdentityProfileVersion.findFirst({
      where: eq(BecomingIdentityProfileVersion.id, profile.currentVersionId),
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

    const profiles = await db.query.BecomingIdentityProfile.findMany({
      where: inArray(BecomingIdentityProfile.onboardingSessionId, sessionIds),
    });

    const versionIds = profiles
      .map((profile) => profile.currentVersionId)
      .filter((versionId): versionId is string => versionId != null);

    const versions = versionIds.length
      ? await db.query.BecomingIdentityProfileVersion.findMany({
          where: inArray(BecomingIdentityProfileVersion.id, versionIds),
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
