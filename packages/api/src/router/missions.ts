import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, inArray } from "@acme/db";
import {
  TrainingCurriculumNode,
  TrainingMission,
  TrainingUnitContent,
  TrainingUnitRun,
} from "@acme/db/schema";

import { missionRepository } from "../repositories/mission-repository";
import { protectedProcedure } from "../trpc";

const UnitRunInputSchema = z.object({ unitRunId: z.string().uuid() });
const SessionInputSchema = z.object({ sessionId: z.string().uuid() });
const EligibilityInputSchema = z.union([
  UnitRunInputSchema,
  z.object({ unitContentId: z.string().uuid(), sessionId: z.string().uuid() }),
]);

const getEligibleRun = async ({
  db,
  userId,
  unitRunId,
}: {
  db: Parameters<typeof missionRepository.getByUnitRun>[0]["db"];
  userId: string;
  unitRunId: string;
}) => {
  const run = await db.query.TrainingUnitRun.findFirst({
    where: and(
      eq(TrainingUnitRun.id, unitRunId),
      eq(TrainingUnitRun.userId, userId),
    ),
  });
  if (!run) return null;
  const unit = await db.query.TrainingUnitContent.findFirst({
    where: eq(TrainingUnitContent.id, run.unitContentId),
  });
  const node = unit
    ? await db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, unit.nodeId),
      })
    : null;
  const parent = node?.parentNodeId
    ? await db.query.TrainingCurriculumNode.findFirst({
        where: eq(TrainingCurriculumNode.id, node.parentNodeId),
      })
    : null;
  return {
    run,
    unit,
    node,
    eligible:
      run.phase === "mastered" &&
      (parent?.kind === "ability" || parent?.kind === "skill_cluster"),
  };
};

export const missionsRouter = {
  eligibility: protectedProcedure
    .input(EligibilityInputSchema)
    .query(async ({ ctx, input }) => {
      const unitRunId =
        "unitRunId" in input
          ? input.unitRunId
          : (
              await ctx.db.query.TrainingUnitRun.findFirst({
                where: and(
                  eq(TrainingUnitRun.userId, ctx.session.user.id),
                  eq(TrainingUnitRun.unitContentId, input.unitContentId),
                  eq(TrainingUnitRun.sessionId, input.sessionId),
                ),
              })
            )?.id;
      if (!unitRunId) return { eligible: false, unitRunId: null };
      const result = await getEligibleRun({
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
      const result = await getEligibleRun({
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
  skip: protectedProcedure
    .input(UnitRunInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await getEligibleRun({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      if (!result?.eligible)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This mission cannot be skipped.",
        });
      await missionRepository.skip({
        db: ctx.db,
        userId: ctx.session.user.id,
        unitRunId: input.unitRunId,
      });
      return { skipped: true };
    }),
  resumable: protectedProcedure
    .input(SessionInputSchema)
    .query(({ ctx, input }) =>
      ctx.db
        .select({
          unitRunId: TrainingMission.unitRunId,
          status: TrainingMission.status,
          spec: TrainingMission.spec,
        })
        .from(TrainingMission)
        .innerJoin(
          TrainingUnitRun,
          eq(TrainingMission.unitRunId, TrainingUnitRun.id),
        )
        .where(
          and(
            eq(TrainingMission.userId, ctx.session.user.id),
            eq(TrainingUnitRun.sessionId, input.sessionId),
            inArray(TrainingMission.status, ["drafting", "active"]),
          ),
        ),
    ),
} satisfies TRPCRouterRecord;
