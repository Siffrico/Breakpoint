import { headers } from "next/headers";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

const createEsdeCaller = async () => {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("x-trpc-source", "esde-rsc");

  const context = await createTRPCContext({
    headers: requestHeaders,
    auth,
  });

  return appRouter.createCaller(context);
};

export const getLearningDomainCatalog = async () => {
  const caller = await createEsdeCaller();
  return caller.esdeSimulation.catalog();
};

export const getActiveScenario = async (domainSlug: string) => {
  const caller = await createEsdeCaller();
  return caller.esdeSimulation.activeScenario({ domainSlug });
};
