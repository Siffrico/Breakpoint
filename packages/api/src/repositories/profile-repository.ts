import { eq } from "@acme/db";
import type { db as databaseClient } from "@acme/db/client";
import {
  account,
  TrainingCurriculumPlan,
  TrainingIdentityProfile,
  TrainingIdentityProfileVersion,
  user,
} from "@acme/db/schema";

import type { ProfileAccount, ProfileBilling, ProfileError, ProfileGeneral } from "../domain/profile/types";
import { type Result } from "../lib/result";

type Database = typeof databaseClient;

export const profileRepository = {
  getGeneralBySession: async ({
    db,
    sessionId,
  }: {
    db: Database;
    sessionId: string;
  }): Promise<Result<ProfileGeneral | null, ProfileError>> => {
    try {
      const profile = await db.query.TrainingIdentityProfile.findFirst({
        where: eq(TrainingIdentityProfile.onboardingSessionId, sessionId),
      });

      if (!profile?.currentVersionId) {
        return {
          success: true,
          data: null,
        };
      }

      const version = await db.query.TrainingIdentityProfileVersion.findFirst({
        where: eq(TrainingIdentityProfileVersion.id, profile.currentVersionId),
      });

      if (!version) {
        return {
          success: true,
          data: null,
        };
      }

      return {
        success: true,
        data: {
          sessionId,
          targetIdentity: version.targetIdentity,
          motivation: version.motivation,
          hardMoments: version.hardMoments,
        },
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Profile details could not be loaded right now.",
        },
      };
    }
  },

  updateGeneralBySession: async ({
    db,
    sessionId,
    targetIdentity,
    motivation,
    hardMoments,
  }: {
    db: Database;
    sessionId: string;
    targetIdentity: string;
    motivation: string;
    hardMoments: string[];
  }): Promise<Result<ProfileGeneral, ProfileError>> => {
    try {
      const profile = await db.query.TrainingIdentityProfile.findFirst({
        where: eq(TrainingIdentityProfile.onboardingSessionId, sessionId),
      });

      if (!profile?.currentVersionId) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "This learning profile could not be found.",
          },
        };
      }

      const [version] = await db
        .update(TrainingIdentityProfileVersion)
        .set({
          targetIdentity,
          motivation,
          hardMoments,
        })
        .where(eq(TrainingIdentityProfileVersion.id, profile.currentVersionId))
        .returning();

      if (!version) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "This learning profile could not be found.",
          },
        };
      }

      await db
        .update(TrainingIdentityProfile)
        .set({
          targetIdentity,
          updatedAt: new Date(),
        })
        .where(eq(TrainingIdentityProfile.id, profile.id));

      await db
        .update(TrainingCurriculumPlan)
        .set({
          targetIdentity,
          updatedAt: new Date(),
        })
        .where(eq(TrainingCurriculumPlan.onboardingSessionId, sessionId));

      return {
        success: true,
        data: {
          sessionId,
          targetIdentity: version.targetIdentity,
          motivation: version.motivation,
          hardMoments: version.hardMoments,
        },
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Profile changes could not be saved right now.",
        },
      };
    }
  },

  getAccountByUserId: async ({
    db,
    userId,
  }: {
    db: Database;
    userId: string;
  }): Promise<Result<ProfileAccount, ProfileError>> => {
    try {
      const [userRecord, accountRecord] = await Promise.all([
        db.query.user.findFirst({
          where: eq(user.id, userId),
        }),
        db.query.account.findFirst({
          where: eq(account.userId, userId),
        }),
      ]);

      if (!userRecord) {
        return {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Account details could not be found.",
          },
        };
      }

      return {
        success: true,
        data: {
          name: userRecord.name,
          email: userRecord.email,
          provider: accountRecord?.providerId ?? null,
          image: userRecord.image ?? null,
        },
      };
    } catch {
      return {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Account details could not be loaded right now.",
        },
      };
    }
  },

  getBillingByUserId: async ({
    userId,
  }: {
    db: Database;
    userId: string;
  }): Promise<Result<ProfileBilling, ProfileError>> => {
    void userId;

    return {
      success: true,
      data: {
        plan: "free",
        manageUrl: null,
      },
    };
  },
};
