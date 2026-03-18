import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import {
  getActiveScenarioWorkflow,
} from "../domain/esde-simulation/workflows/get-active-scenario-workflow";
import {
  getDomainCatalogWorkflow,
} from "../domain/esde-simulation/workflows/get-domain-catalog-workflow";
import {
  submitScenarioResponseWorkflow,
} from "../domain/esde-simulation/workflows/submit-scenario-response-workflow";
import { esdeSimulationRepository } from "../repositories/esde-simulation-repository";
import { publicProcedure } from "../trpc";

const DomainSlugSchema = z.object({
  domainSlug: z.string().min(1),
});

const SubmitScenarioResponseSchema = z.object({
  domainSlug: z.string().min(1),
  scenarioId: z.string().min(1),
  response: z.string().min(40).max(8_000),
});

const getErrorCode = (message: string) => {
  if (message.includes("does not exist")) {
    return "NOT_FOUND" as const;
  }

  if (
    message.includes("locked") ||
    message.includes("more complete") ||
    message.includes("not the active scenario")
  ) {
    return "BAD_REQUEST" as const;
  }

  return "INTERNAL_SERVER_ERROR" as const;
};

export const esdeSimulationRouter = {
  catalog: publicProcedure.query(async ({ ctx }) => {
    const result = await getDomainCatalogWorkflow({
      listDomains: () =>
        esdeSimulationRepository.listDomains({
          db: ctx.db,
          userId: ctx.session?.user.id,
        }),
    });

    if (!result.success) {
      throw new TRPCError({
        code: getErrorCode(result.error),
        message: result.error,
      });
    }

    return result.data;
  }),

  activeScenario: publicProcedure
    .input(DomainSlugSchema)
    .query(async ({ ctx, input }) => {
      const result = await getActiveScenarioWorkflow(input, {
        getDomainBySlug: (domainSlug) =>
          esdeSimulationRepository.getDomainBySlug({
            db: ctx.db,
            domainSlug,
            userId: ctx.session?.user.id,
          }),
        getActiveScenarioByDomainSlug: (domainSlug) =>
          esdeSimulationRepository.getActiveScenarioByDomainSlug({
            db: ctx.db,
            domainSlug,
            userId: ctx.session?.user.id,
          }),
      });

      if (!result.success) {
        throw new TRPCError({
          code: getErrorCode(result.error),
          message: result.error,
        });
      }

      return result.data;
    }),

  submitResponse: publicProcedure
    .input(SubmitScenarioResponseSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session?.user.id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Sign in to save E.S.D.E. progress.",
        });
      }
      const userId = ctx.session.user.id;

      const result = await submitScenarioResponseWorkflow(input, {
        getDomainBySlug: (domainSlug) =>
          esdeSimulationRepository.getDomainBySlug({
            db: ctx.db,
            domainSlug,
            userId,
          }),
        getActiveScenarioByDomainSlug: (domainSlug) =>
          esdeSimulationRepository.getActiveScenarioByDomainSlug({
            db: ctx.db,
            domainSlug,
            userId,
          }),
        saveScenarioAttempt: ({ evaluation, ...payload }) =>
          esdeSimulationRepository.saveScenarioAttempt({
            db: ctx.db,
            userId,
            ...payload,
            evaluation,
          }),
      });

      if (!result.success) {
        throw new TRPCError({
          code: getErrorCode(result.error),
          message: result.error,
        });
      }

      return result.data;
    }),
} satisfies TRPCRouterRecord;
