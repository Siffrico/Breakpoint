"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";

import { useTRPC } from "~/trpc/react";

export type PlanState = RouterOutputs["training"]["activePlan"];
export type EducationUnit = RouterOutputs["training"]["unit"];
export type OnboardingState = RouterOutputs["training"]["onboardingState"];
export type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
export type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];
export type ChatHistory = RouterOutputs["training"]["chatHistory"];
export type WorkspaceShellState = RouterOutputs["training"]["workspaceShell"];
export type WorkspaceMode = "history" | "onboarding" | "unit" | "idle";

const isUnitPreparingError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    message?: string;
    data?: { code?: string };
  };
  return (
    candidate.data?.code === "PRECONDITION_FAILED" &&
    candidate.message === "UNIT_PREPARING"
  );
};

const getUnitPreparingNodeId = (error: unknown) => {
  if (!isUnitPreparingError(error)) return null;
  const candidate = error as { data?: { unitNodeId?: string | null } };
  return candidate.data?.unitNodeId ?? null;
};

export function useWorkspaceSession({
  plan,
  onboardingState,
  projects,
  sessionId,
  selectedSessionId,
  selectedChatId,
  chatHistory,
  preview,
  activeAdvanceTransition,
}: {
  plan: PlanState | null;
  onboardingState: OnboardingState | null;
  projects: LearningProject[];
  sessionId: string;
  selectedSessionId: string;
  selectedChatId: string | null;
  chatHistory: ChatHistory | null;
  preview: boolean;
  activeAdvanceTransition: {
    sessionId: string;
    projectedNodeId: string;
  } | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isInitialSession = selectedSessionId === sessionId;
  const projectsQuery = useQuery(
    trpc.training.listLearningProjects.queryOptions(undefined, {
      initialData: projects,
      staleTime: Number.POSITIVE_INFINITY,
    }),
  );
  const serverProjects = projectsQuery.data;
  const selectedProject = serverProjects.find(
    (project) => project.sessionId === selectedSessionId,
  );
  const isOnboardingProject = Boolean(
    selectedProject && selectedProject.status !== "active",
  );
  const initialShell: WorkspaceShellState = onboardingState
    ? {
        kind: "onboarding",
        sessionId,
        projects,
        onboardingState,
      }
    : plan
      ? {
          kind: "workspace",
          sessionId,
          projects,
          plan,
        }
      : { kind: "needs-onboarding", projects };
  const workspaceShellQuery = useQuery({
    ...trpc.training.workspaceShell.queryOptions(
      { sessionId: selectedSessionId },
      {
        enabled: !preview,
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
      },
    ),
    initialData: isInitialSession ? initialShell : undefined,
  });
  const resolvedPlan =
    workspaceShellQuery.data?.kind === "workspace"
      ? workspaceShellQuery.data.plan
      : null;
  const resolvedOnboardingState =
    workspaceShellQuery.data?.kind === "onboarding"
      ? workspaceShellQuery.data.onboardingState
      : null;
  const fallbackActiveNodeId = resolvedPlan?.nextUnitId ?? null;
  const chatPreselected = Boolean(
    selectedChatId && selectedChatId !== fallbackActiveNodeId,
  );
  const aiWorkspaceQuery = useQuery(
    trpc.training.aiWorkspace.queryOptions(
      { sessionId: selectedSessionId },
      {
        enabled: !preview && !isOnboardingProject,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: false,
        refetchInterval: () => {
          if (chatPreselected) return false;
          return activeAdvanceTransition ? 30_000 : false;
        },
      },
    ),
  );
  const aiWorkspace = aiWorkspaceQuery.data ?? null;
  const activeNodeId =
    aiWorkspace?.state?.recallUnitId ??
    aiWorkspace?.state?.activeUnitId ??
    fallbackActiveNodeId;
  const activeNode = activeNodeId
    ? (resolvedPlan?.nodes.find((node) => node.id === activeNodeId) ?? null)
    : null;
  const isHistorySelected = Boolean(
    selectedChatId && selectedChatId !== activeNodeId,
  );
  const chatHistoryQuery = useQuery(
    trpc.training.chatHistory.queryOptions(
      { sessionId: selectedSessionId, nodeId: selectedChatId ?? "" },
      {
        enabled: !preview && isHistorySelected,
        initialData:
          isInitialSession && chatHistory?.node.id === selectedChatId
            ? chatHistory
            : undefined,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: false,
      },
    ),
  );
  const resolvedChatHistory = isHistorySelected
    ? (chatHistoryQuery.data ?? null)
    : null;
  const unitQuery = useQuery(
    trpc.training.unit.queryOptions(
      { sessionId: selectedSessionId, nodeId: activeNode?.id ?? "" },
      {
        enabled: !preview && !isHistorySelected && Boolean(activeNode),
        retry: false,
      },
    ),
  );
  const workspaceError =
    aiWorkspaceQuery.failureReason ?? aiWorkspaceQuery.error;
  const unitPreparing = isUnitPreparingError(workspaceError);
  const preparingNodeId = getUnitPreparingNodeId(workspaceError);
  const awaitUnitQuery = useQuery(
    trpc.training.awaitUnit.queryOptions(
      { sessionId: selectedSessionId, nodeId: preparingNodeId ?? "" },
      {
        enabled:
          !preview && !isHistorySelected && unitPreparing && !!preparingNodeId,
        staleTime: 0,
        gcTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
        refetchInterval: (query) =>
          query.state.data?.ready ? false : query.state.error ? 10_000 : 3_000,
      },
    ),
  );
  const awaitedUnitReady = awaitUnitQuery.data?.ready ?? false;
  useEffect(() => {
    if (!awaitedUnitReady) return;
    void queryClient.invalidateQueries({
      queryKey: trpc.training.aiWorkspace.queryKey({
        sessionId: selectedSessionId,
      }),
    });
  }, [
    awaitedUnitReady,
    queryClient,
    selectedSessionId,
    trpc.training.aiWorkspace,
  ]);

  return {
    aiWorkspace,
    activeNode,
    activeNodeId,
    chatHistoryQuery,
    fetchedUnit: unitQuery.data ?? null,
    isHistorySelected,
    isInitialSession,
    mode: (isHistorySelected
      ? "history"
      : resolvedOnboardingState
        ? "onboarding"
        : unitQuery.data
          ? "unit"
          : "idle") as WorkspaceMode,
    resolvedChatHistory,
    resolvedOnboardingState,
    selectedProject,
    serverProjects,
    unitPreparing,
    workspaceShellQuery,
  };
}
