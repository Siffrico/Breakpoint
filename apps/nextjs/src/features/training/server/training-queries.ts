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

export const getWorkspaceShell = async (input: {
  sessionId?: string;
  cookieSessionId?: string;
}) => {
  const caller = await createCaller();
  return caller.training.workspaceShell(input);
};

export const getWorkspaceState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.home({ sessionId });
};

export const getAiWorkspace = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.aiWorkspace({ sessionId });
};

const isUnitPreparingError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: string;
    message?: string;
    data?: { code?: string };
  };
  return (
    (candidate.code === "PRECONDITION_FAILED" ||
      candidate.data?.code === "PRECONDITION_FAILED") &&
    candidate.message === "UNIT_PREPARING"
  );
};

export const getInitialAiWorkspace = async (sessionId: string) => {
  try {
    return await getAiWorkspace(sessionId);
  } catch (error) {
    if (isUnitPreparingError(error)) return null;
    throw error;
  }
};

export const getProfileState = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.profile({ sessionId });
};

export const getChatHistory = async ({
  nodeId,
  sessionId,
}: {
  nodeId: string;
  sessionId: string;
}) => {
  const caller = await createCaller();
  return caller.training.chatHistory({ nodeId, sessionId });
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
