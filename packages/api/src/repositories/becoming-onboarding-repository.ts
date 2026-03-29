import { asc, eq } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  BecomingIdentityProfile,
  BecomingIdentityProfileVersion,
  BecomingOnboardingMessage,
  BecomingOnboardingSession,
} from "@acme/db/schema";

import type { IdentityReport, OnboardingTranscriptMessage } from "../domain/becoming/types/becoming.types";
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

  getSession: async ({ db, sessionId }: { db: Database; sessionId: string }) =>
    (await db.query.BecomingOnboardingSession.findFirst({
      where: eq(BecomingOnboardingSession.id, sessionId),
    })) ?? null,

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
};
