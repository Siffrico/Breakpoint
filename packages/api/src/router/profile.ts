import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import { UpdateProfileGeneralInputSchema } from "@acme/validators";

import { getProfileAccountWorkflow } from "../domain/profile/workflows/get-account";
import { getProfileBillingWorkflow } from "../domain/profile/workflows/get-billing";
import { getProfileGeneralWorkflow } from "../domain/profile/workflows/get-general";
import { updateProfileGeneralWorkflow } from "../domain/profile/workflows/update-general";
import { becomingOnboardingRepository } from "../repositories/becoming-onboarding-repository";
import { profileRepository } from "../repositories/profile-repository";
import { protectedProcedure } from "../trpc";

const SessionIdInputSchema = UpdateProfileGeneralInputSchema.pick({
  sessionId: true,
});

const throwOnProfileFailure = <T>(result: {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}) => {
  if (result.success) {
    return result.data as T;
  }

  throw new TRPCError({
    code: (result.error?.code ?? "INTERNAL_SERVER_ERROR") as TRPCError["code"],
    message: result.error?.message ?? "Profile request failed.",
  });
};

const requireOwnedSession = async ({
  db,
  userId,
  sessionId,
}: {
  db: Parameters<typeof becomingOnboardingRepository.getSession>[0]["db"];
  userId: string;
  sessionId: string;
}) => {
  const session = await becomingOnboardingRepository.getSession({
    db,
    sessionId,
  });

  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This learning project could not be found.",
    });
  }

  if (session.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this learning project.",
    });
  }

  return session;
};

export const profileRouter = {
  getGeneral: protectedProcedure
    .input(SessionIdInputSchema)
    .query(async ({ ctx, input }) => {
      await requireOwnedSession({
        db: ctx.db,
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
      });

      const result = throwOnProfileFailure(
        await getProfileGeneralWorkflow({
          deps: {
            getGeneral: () =>
              profileRepository.getGeneralBySession({
                db: ctx.db,
                sessionId: input.sessionId,
              }),
          },
        }),
      );

      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This learning profile could not be found.",
        });
      }

      return result;
    }),

  updateGeneral: protectedProcedure
    .input(UpdateProfileGeneralInputSchema)
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const db = tx as unknown as typeof ctx.db;

        await requireOwnedSession({
          db,
          userId: ctx.session.user.id,
          sessionId: input.sessionId,
        });

        const result = throwOnProfileFailure(
          await updateProfileGeneralWorkflow({
            deps: {
              updateGeneral: () =>
                profileRepository.updateGeneralBySession({
                  db,
                  sessionId: input.sessionId,
                  targetIdentity: input.targetIdentity,
                  motivation: input.motivation,
                  hardMoments: input.hardMoments,
                }),
            },
          }),
        );

        await becomingOnboardingRepository.touchSession({
          db,
          sessionId: input.sessionId,
        });

        return result;
      })),

  getAccount: protectedProcedure.query(async ({ ctx }) =>
    throwOnProfileFailure(
      await getProfileAccountWorkflow({
        deps: {
          getAccount: () =>
            profileRepository.getAccountByUserId({
              db: ctx.db,
              userId: ctx.session.user.id,
            }),
        },
      }),
    )),

  getBilling: protectedProcedure.query(async ({ ctx }) =>
    throwOnProfileFailure(
      await getProfileBillingWorkflow({
        deps: {
          getBilling: () =>
            profileRepository.getBillingByUserId({
              db: ctx.db,
              userId: ctx.session.user.id,
            }),
        },
      }),
    )),
} satisfies TRPCRouterRecord;
