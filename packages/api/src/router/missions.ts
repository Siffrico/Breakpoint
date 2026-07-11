import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { missionRepository } from "../repositories/mission-repository";
import { protectedProcedure } from "../trpc";

const UnitRunInputSchema = z.object({ unitRunId: z.string().uuid() });
const SessionInputSchema = z.object({ sessionId: z.string().uuid() });
const EligibilityInputSchema = z.union([
  UnitRunInputSchema,
  z.object({ unitContentId: z.string().uuid(), sessionId: z.string().uuid() }),
]);

export const missionsRouter = {
  eligibility: protectedProcedure
    .input(EligibilityInputSchema)
    .query(async ({ ctx, input }) => {
      const unitRunId =
        "unitRunId" in input
          ? input.unitRunId
          : await missionRepository.findUnitRunId({
              db: ctx.db,
              userId: ctx.session.user.id,
              unitContentId: input.unitContentId,
              sessionId: input.sessionId,
            });
      if (!unitRunId) return { eligible: false, unitRunId: null };
      const result = await missionRepository.getEligibleRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId,
      });
      return {
        eligible: result?.eligible ?? false,
        unitRunId: result?.eligible ? unitRunId : null,
      };
    }),
  getForUnitRun: protectedProcedure
    .input(UnitRunInputSchema)
    .query(async ({ ctx, input }) => {
      const result = await missionRepository.getEligibleRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Mission unit not found.",
        });
      if (!result.eligible)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This unit is not eligible for a field mission.",
        });
      return missionRepository.getByUnitRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
    }),
  start: protectedProcedure
    .input(UnitRunInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await missionRepository.getEligibleRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (!result?.eligible)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This mission cannot be started.",
        });
      const mission = await missionRepository.getByUnitRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (!mission?.spec || !mission.plan)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Choose a mission before starting it.",
        });
      const updated = await missionRepository.start({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (updated.length === 0)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This mission can no longer be started.",
        });
      return { status: "active" as const };
    }),
  skip: protectedProcedure
    .input(UnitRunInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await missionRepository.getEligibleRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (!result?.eligible)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This mission cannot be skipped.",
        });
      const updated = await missionRepository.skip({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (updated.length === 0)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This mission can no longer be skipped.",
        });
      return { skipped: true };
    }),
  resumable: protectedProcedure
    .input(SessionInputSchema)
    .query(({ ctx, input }) =>
      missionRepository.listResumable({
        db: ctx.db,
        userId: ctx.session.user.id,
        sessionId: input.sessionId,
      }),
    ),
} satisfies TRPCRouterRecord;
