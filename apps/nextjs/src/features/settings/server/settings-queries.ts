import { headers } from "next/headers";

import { appRouter, createTRPCContext } from "@acme/api";

import type { TopicNavItem } from "~/features/settings/components/settings-nav";
import { auth } from "~/auth/server";

const createCaller = async () => {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("x-trpc-source", "settings-rsc");

  const context = await createTRPCContext({
    headers: requestHeaders,
    auth,
  });

  return appRouter.createCaller(context);
};

export const resolveSettingsSessionId = async (
  preferredSessionId?: string | null,
) => {
  if (preferredSessionId) {
    return preferredSessionId;
  }

  const caller = await createCaller();
  const projects = await caller.training.listLearningProjects();

  return (
    projects.find((project) => project.status === "active")?.sessionId ??
    projects[0]?.sessionId ??
    null
  );
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

export const getEducationExperience = async () => {
  const caller = await createCaller();
  return caller.profile.getEducationExperience();
};

export const listMemories = async () => {
  const caller = await createCaller();
  return caller.memory.list();
};

export const listLearningProjects = async () => {
  const caller = await createCaller();
  return caller.training.listLearningProjects();
};

const toTopicStatus = (status: string): TopicNavItem["status"] =>
  status === "active" || status === "building" ? status : "onboarding";

// Sidebar Topics tree source: one row per learning project. Reuses the already
// warm listLearningProjects read so the tree costs no extra round-trip.
export const listTopicNavItems = async (): Promise<TopicNavItem[]> => {
  const projects = await listLearningProjects();
  return projects.map((project) => ({
    sessionId: project.sessionId,
    title: project.title,
    status: toTopicStatus(project.status),
  }));
};

export const getProjectTopic = async (sessionId: string) => {
  const caller = await createCaller();
  return caller.training.projectTopic({ sessionId });
};
