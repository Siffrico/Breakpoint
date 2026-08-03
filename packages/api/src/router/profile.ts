import type { TRPCRouterRecord } from "@trpc/server";

import {
  EducationExperienceCustomizationSchema,
  UpdateProfileGeneralInputSchema,
} from "@acme/validators";

import { getProfileAccountWorkflow } from "../domain/profile/workflows/get-account";
import { getProfileBillingWorkflow } from "../domain/profile/workflows/get-billing";
import { getEducationExperienceWorkflow } from "../domain/profile/workflows/get-education-experience";
import { getProfileGeneralWorkflow } from "../domain/profile/workflows/get-general";
import { updateEducationExperienceWorkflow } from "../domain/profile/workflows/update-education-experience";
import { updateProfileGeneralWorkflow } from "../domain/profile/workflows/update-general";
import { requireOwnedSession, runProfile } from "../effect/profile-edge";
import { trainingOnboardingRepository } from "../repositories/training-onboarding-repository";
import { protectedProcedure } from "../trpc";

const SessionIdInputSchema = UpdateProfileGeneralInputSchema.pick({
  sessionId: true,
});

const requireOwnedProfileSession = ({
  db,
  userId,
  sessionId,
}: {
  db: Parameters<typeof trainingOnboardingRepository.getSession>[0]["db"];
  userId: string;
  sessionId: string;
}) => {
  return requireOwnedSession({
    getSession: (id) =>
      trainingOnboardingRepository.getSession({ db, sessionId: id }),
    userId,
    sessionId,
  });
};

export const profileRouter = {
  getGeneral: protectedProcedure
    .input(SessionIdInputSchema)
    .query(async ({ ctx, input }) => {
      await requireOwnedProfileSession({
        db: ctx.db,
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
      });

      return runProfile(ctx.db, getProfileGeneralWorkflow(input.sessionId));
    }),

  updateGeneral: protectedProcedure
    .input(UpdateProfileGeneralInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const db = tx as unknown as typeof ctx.db;

        await requireOwnedProfileSession({
          db,
          userId: ctx.session.user.id,
          sessionId: input.sessionId,
        });

        const result = await runProfile(
          db,
          updateProfileGeneralWorkflow({
            sessionId: input.sessionId,
            targetIdentity: input.targetIdentity,
            motivation: input.motivation,
            hardMoments: input.hardMoments,
          }),
        );

        await trainingOnboardingRepository.touchSession({
          db,
          sessionId: input.sessionId,
        });

        return result;
      }),
    ),

  getAccount: protectedProcedure.query(({ ctx }) =>
    runProfile(ctx.db, getProfileAccountWorkflow(ctx.session.user.id)),
  ),

  getBilling: protectedProcedure.query(({ ctx }) =>
    runProfile(ctx.db, getProfileBillingWorkflow(ctx.session.user.id)),
  ),

  getEducationExperience: protectedProcedure.query(({ ctx }) =>
    runProfile(ctx.db, getEducationExperienceWorkflow(ctx.session.user.id)),
  ),

  updateEducationExperience: protectedProcedure
    .input(EducationExperienceCustomizationSchema)
    .mutation(({ ctx, input }) =>
      runProfile(
        ctx.db,
        updateEducationExperienceWorkflow(ctx.session.user.id, input),
      ),
    ),
} satisfies TRPCRouterRecord;
