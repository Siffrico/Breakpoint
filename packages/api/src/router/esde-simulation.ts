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
  catalog: publicProcedure.query(async () => {
    const result = await getDomainCatalogWorkflow({
      listDomains: esdeSimulationRepository.listDomains,
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
    .query(async ({ input }) => {
      const result = await getActiveScenarioWorkflow(input, {
        getDomainBySlug: esdeSimulationRepository.getDomainBySlug,
        getActiveScenarioByDomainSlug:
          esdeSimulationRepository.getActiveScenarioByDomainSlug,
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
    .mutation(async ({ input }) => {
      const result = await submitScenarioResponseWorkflow(input, {
        getDomainBySlug: esdeSimulationRepository.getDomainBySlug,
        getActiveScenarioByDomainSlug:
          esdeSimulationRepository.getActiveScenarioByDomainSlug,
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
