import { headers } from "next/headers";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

const createCaller = async () => {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("x-trpc-source", "becoming-rsc");

  const context = await createTRPCContext({
    headers: requestHeaders,
    auth,
  });

  return appRouter.createCaller(context);
};

export const getActivePlan = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.becoming.activePlan({ sessionId });
};

export const getHomeState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.becoming.home({ sessionId });
};

export const getProfileState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.becoming.profile({ sessionId });
};

export const getForgeUnit = async ({
  nodeId,
  sessionId,
}: {
  nodeId: string;
  sessionId: string;
}) => {
  const caller = await createCaller();
  return caller.becoming.unit({ nodeId, sessionId });
};

export const getCapstone = async ({
  nodeId,
  sessionId,
}: {
  nodeId: string;
  sessionId: string;
}) => {
  const caller = await createCaller();
  return caller.becoming.getCapstone({ nodeId, sessionId });
};

export const getUnit = getForgeUnit;
