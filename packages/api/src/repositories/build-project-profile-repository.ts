import type { db as databaseClient } from "@acme/db/client";
import { eq } from "@acme/db";
import {
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
} from "@acme/db/schema";

import type { IdentityReport } from "../domain/training/types/training.types";

type Database = typeof databaseClient;

export const buildProjectProfileRepository = {
  upsertProfileVersion: async ({
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
    await db
      .insert(TrainingIdentityProfile)
      .values({
        userId: userId ?? null,
        onboardingSessionId: sessionId,
        status: "active",
        targetIdentity: report.targetIdentity,
        headline: report.headline,
      })
      .onConflictDoNothing({
        target: TrainingIdentityProfile.onboardingSessionId,
      });

    const profile = await db.query.TrainingIdentityProfile.findFirst({
      where: eq(TrainingIdentityProfile.onboardingSessionId, sessionId),
    });
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
      .set({
        currentVersionId: version.id,
        status: "active",
        targetIdentity: report.targetIdentity,
        headline: report.headline,
      })
      .where(eq(TrainingIdentityProfile.id, profile.id));

    return { profile, version };
  },
};
