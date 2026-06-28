import { cache } from "react";
import { headers } from "next/headers";

import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

const createCaller = cache(async () => {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("x-trpc-source", "training-rsc");

  const context = await createTRPCContext({
    headers: requestHeaders,
    auth,
  });

  return appRouter.createCaller(context);
});

export const getActivePlan = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.activePlan({ sessionId });
};

export const getProjectOverview = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.projectOverview({ sessionId });
};

export const getOnboardingState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.onboardingState({ sessionId });
};

export const listLearningProjects = async () => {
  const caller = await createCaller();
  return caller.training.listLearningProjects();
};

export const getWorkspaceState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.home({ sessionId });
};

export const getAiWorkspace = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.aiWorkspace({ sessionId });
};

export const getProfileState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.profile({ sessionId });
};

export const getEducationUnit = async ({
  nodeId,
  sessionId,
}: {
  nodeId: string;
  sessionId: string;
}) => {
  const caller = await createCaller();
  return caller.training.unit({ nodeId, sessionId });
};

export const getUnit = getEducationUnit;
