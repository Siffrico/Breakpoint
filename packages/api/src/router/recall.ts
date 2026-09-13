import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { RecallTaskActionInputSchema } from "@acme/validators";

import { deferRecallWorkflow } from "../domain/training/recall/workflows/defer-recall";
import { getRecallOfferWorkflow } from "../domain/training/recall/workflows/get-recall-offer";
import { pauseRecallWorkflow } from "../domain/training/recall/workflows/pause-recall";
import {
  prepareRecallWorkflow,
  prepareReservedRecallWorkflow,
} from "../domain/training/recall/workflows/prepare-recall";
import { startRecallWorkflow } from "../domain/training/recall/workflows/start-recall";
import { trainingCurriculumRepository } from "../repositories/training-curriculum-repository";
import { protectedProcedure } from "../trpc";
import { runRecall } from "./run-effect";

const OfferInputSchema = z.object({
  sessionId: z.string().uuid(),
  boundaryNodeId: z.string().uuid().nullable(),
});

const StartInputSchema = RecallTaskActionInputSchema.extend({
  boundaryNodeId: z.string().uuid().nullable(),
});

const requireOwnedActivePlan = async (
  db: Parameters<
    typeof trainingCurriculumRepository.getOwnedActivePlan
  >[0]["db"],
  sessionId: string,
  userId: string,
) => {
  const plan = await trainingCurriculumRepository.getOwnedActivePlan({
    db,
    sessionId,
    userId,
  });
  if (!plan) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This learning project could not be found.",
    });
  }
  return plan;
};

export const recallRouter = {
  offer: protectedProcedure
    .input(OfferInputSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const plan = await requireOwnedActivePlan(
        ctx.db,
        input.sessionId,
        userId,
      );
      const { offer, reservation } = await runRecall(
        ctx.db,
        getRecallOfferWorkflow({
          userId,
          sessionId: input.sessionId,
          planId: plan.id,
          boundaryNodeId: input.boundaryNodeId,
        }),
      );
      if (reservation) {
        const prepare = () =>
          runRecall(ctx.db, prepareReservedRecallWorkflow(reservation))
            .then(() => undefined)
            .catch((error: unknown) => {
              console.error("Recall preparation failed", {
                sessionId: input.sessionId,
                planId: plan.id,
                error,
              });
            });
        if (ctx.scheduleBackgroundTask) ctx.scheduleBackgroundTask(prepare);
        else void prepare();
      }
      return offer;
    }),

  prepare: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const plan = await requireOwnedActivePlan(
        ctx.db,
        input.sessionId,
        userId,
      );
      const prepare = () =>
        runRecall(
          ctx.db,
          prepareRecallWorkflow({
            userId,
            sessionId: input.sessionId,
            planId: plan.id,
            now: new Date(),
          }),
        ).then(() => undefined);
      if (ctx.scheduleBackgroundTask) {
        ctx.scheduleBackgroundTask(prepare);
      } else {
        void prepare();
      }
      return { scheduled: true };
    }),

  start: protectedProcedure.input(StartInputSchema).mutation(({ ctx, input }) =>
    runRecall(
      ctx.db,
      startRecallWorkflow({
        userId: ctx.session.user.id,
        taskId: input.taskId,
        boundaryNodeId: input.boundaryNodeId,
      }),
    ),
  ),

  pause: protectedProcedure
    .input(RecallTaskActionInputSchema)
    .mutation(({ ctx, input }) =>
      runRecall(
        ctx.db,
        pauseRecallWorkflow({
          userId: ctx.session.user.id,
          taskId: input.taskId,
          now: new Date(),
        }),
      ),
    ),

  defer: protectedProcedure.input(StartInputSchema).mutation(({ ctx, input }) =>
    runRecall(
      ctx.db,
      deferRecallWorkflow({
        userId: ctx.session.user.id,
        taskId: input.taskId,
        boundaryNodeId: input.boundaryNodeId,
        now: new Date(),
      }),
    ),
  ),
} satisfies TRPCRouterRecord;
