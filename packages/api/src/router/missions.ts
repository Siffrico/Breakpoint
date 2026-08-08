import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { getMissionEligibilityWorkflow } from "../domain/training/missions/workflows/get-mission-eligibility";
import { getMissionForUnitRunWorkflow } from "../domain/training/missions/workflows/get-mission-for-unit-run";
import { listResumableMissionsWorkflow } from "../domain/training/missions/workflows/list-resumable-missions";
import { startMissionWorkflow } from "../domain/training/missions/workflows/start-mission";
import { protectedProcedure } from "../trpc";
import { runMission } from "./run-effect";

const UnitRunInputSchema = z.object({ unitRunId: z.string().uuid() });
const SessionInputSchema = z.object({ sessionId: z.string().uuid() });
const EligibilityInputSchema = z.union([
  UnitRunInputSchema,
  z.object({ unitContentId: z.string().uuid(), sessionId: z.string().uuid() }),
]);

/** Every procedure: validate, authorize via ctx, invoke one workflow. Lifecycle
 * rules and error copy live in the domain and the edge respectively. */
export const missionsRouter = {
  eligibility: protectedProcedure
    .input(EligibilityInputSchema)
    .query(({ ctx, input }) =>
      runMission(
        ctx.db,
        getMissionEligibilityWorkflow({
          userId: ctx.session.user.id,
          input,
        }),
      ),
    ),

  getForUnitRun: protectedProcedure
    .input(UnitRunInputSchema)
    .query(({ ctx, input }) =>
      runMission(
        ctx.db,
        getMissionForUnitRunWorkflow({
          userId: ctx.session.user.id,
          unitRunId: input.unitRunId,
        }),
      ),
    ),

  start: protectedProcedure
    .input(UnitRunInputSchema)
    .mutation(({ ctx, input }) =>
      runMission(
        ctx.db,
        startMissionWorkflow({
          userId: ctx.session.user.id,
          unitRunId: input.unitRunId,
        }),
      ),
    ),

  resumable: protectedProcedure
    .input(SessionInputSchema)
    .query(({ ctx, input }) =>
      runMission(
        ctx.db,
        listResumableMissionsWorkflow({
          userId: ctx.session.user.id,
          sessionId: input.sessionId,
        }),
      ),
    ),
} satisfies TRPCRouterRecord;
