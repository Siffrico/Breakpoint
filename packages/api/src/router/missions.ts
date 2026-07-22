import type { TRPCRouterRecord } from "@trpc/server";
import { Effect } from "effect";
import { z } from "zod/v4";

import { getMissionEligibilityWorkflow } from "../domain/training/missions/workflows/get-mission-eligibility";
import { getMissionForUnitRunWorkflow } from "../domain/training/missions/workflows/get-mission-for-unit-run";
import { listResumableMissionsWorkflow } from "../domain/training/missions/workflows/list-resumable-missions";
import { startMissionWorkflow } from "../domain/training/missions/workflows/start-mission";
import { runMission } from "../effect/mission-edge";
import { missionLayer } from "../effect/runtime";
import { protectedProcedure } from "../trpc";

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
        getMissionEligibilityWorkflow({
          userId: ctx.session.user.id,
          input,
        }).pipe(Effect.provide(missionLayer(ctx.db))),
      ),
    ),

  getForUnitRun: protectedProcedure
    .input(UnitRunInputSchema)
    .query(({ ctx, input }) =>
      runMission(
        getMissionForUnitRunWorkflow({
          userId: ctx.session.user.id,
          unitRunId: input.unitRunId,
        }).pipe(Effect.provide(missionLayer(ctx.db))),
      ),
    ),

  start: protectedProcedure
    .input(UnitRunInputSchema)
    .mutation(({ ctx, input }) =>
      runMission(
        startMissionWorkflow({
          userId: ctx.session.user.id,
          unitRunId: input.unitRunId,
        }).pipe(Effect.provide(missionLayer(ctx.db))),
      ),
    ),

  resumable: protectedProcedure
    .input(SessionInputSchema)
    .query(({ ctx, input }) =>
      runMission(
        listResumableMissionsWorkflow({
          userId: ctx.session.user.id,
          sessionId: input.sessionId,
        }).pipe(Effect.provide(missionLayer(ctx.db))),
      ),
    ),
} satisfies TRPCRouterRecord;
