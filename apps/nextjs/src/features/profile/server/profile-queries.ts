import { headers } from "next/headers";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

const createCaller = async () => {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("x-trpc-source", "profile-rsc");

  const context = await createTRPCContext({
    headers: requestHeaders,
    auth,
  });

  return appRouter.createCaller(context);
};

export const resolveProfileSessionId = async (preferredSessionId?: string | null) => {
  if (preferredSessionId) {
    return preferredSessionId;
  }

  const caller = await createCaller();
  const projects = await caller.training.listLearningProjects().catch(() => []);

  return projects[0]?.sessionId ?? null;
};

export const getProfileGeneral = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.profile.getGeneral({ sessionId });
};

export const getProfileAccount = async () => {
  const caller = await createCaller();
  return caller.profile.getAccount();
};

export const getProfileBilling = async () => {
  const caller = await createCaller();
  return caller.profile.getBilling();
};

export const listMemories = async () => {
  const caller = await createCaller();
  return caller.memory.list();
};
