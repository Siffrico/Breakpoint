"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";

import { useTRPC } from "~/trpc/react";

export type PlanState = RouterOutputs["training"]["activePlan"];
export type EducationUnit = RouterOutputs["training"]["unit"];
export type OnboardingState = RouterOutputs["training"]["onboardingState"];
export type AiWorkspaceResult = RouterOutputs["training"]["aiWorkspace"];
export type AiWorkspace = Extract<
  AiWorkspaceResult,
  { kind: "ready" }
>["workspace"];
export type UnitAdvanceGate = AiWorkspace["unitAdvanceGate"];
export type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];
export type ChatHistory = RouterOutputs["training"]["chatHistory"];
export type WorkspaceShellState = RouterOutputs["training"]["workspaceShell"];
export type WorkspaceMode =
  | "history"
  | "onboarding"
  | "unit"
  | "complete"
  | "idle";

const LOCKED_UNIT_ADVANCE_GATE = { status: "locked" } as const;

/**
 * The canonical workspace view model: every query the workspace needs, plus
 * the single source of truth for `mode` and the live unit. The optimistic
 * unit overlay lives here — next to the fetched unit it shadows — so no other
 * layer can compute a second, divergent projection.
 */
export function useWorkspaceSession({
  plan,
  onboardingState,
  projects,
  sessionId,
  selectedSessionId,
  selectedChatId,
  chatHistory,
  preview,
}: {
  plan: PlanState | null;
  onboardingState: OnboardingState | null;
  projects: LearningProject[];
  sessionId: string;
  selectedSessionId: string;
  selectedChatId: string | null;
  chatHistory: ChatHistory | null;
  preview: boolean;
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
  const aiWorkspaceQuery = useQuery(
    trpc.training.aiWorkspace.queryOptions(
      { sessionId: selectedSessionId },
      {
        enabled: !preview && !isOnboardingProject,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: false,
      },
    ),
  );
  // Readiness arrives in-band: "preparing" is data, not an error to sniff.
  const workspaceResult = aiWorkspaceQuery.data ?? null;
  const aiWorkspace =
    workspaceResult?.kind === "ready" ? workspaceResult.workspace : null;
  const unitPreparing = workspaceResult?.kind === "preparing";
  const preparingNodeId =
    workspaceResult?.kind === "preparing" ? workspaceResult.nodeId : null;
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
        enabled:
          !preview &&
          !isHistorySelected &&
          !unitPreparing &&
          Boolean(activeNode),
        retry: false,
      },
    ),
  );
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

  // Optimistic unit overlay: a running turn streams unit-state updates faster
  // than the unit query refetches. The overlay only shadows the same unit in
  // the same session; anything else falls back to the fetched unit.
  const [liveUnitState, setLiveUnitState] = useState({
    sessionId,
    unit: null as EducationUnit | null,
  });
  const fetchedUnit = unitQuery.data ?? null;
  const liveUnit =
    liveUnitState.sessionId === selectedSessionId &&
    liveUnitState.unit?.nodeId === fetchedUnit?.nodeId
      ? liveUnitState.unit
      : fetchedUnit;
  const onUnitStateChange = useCallback(
    (nextUnit: EducationUnit) => {
      setLiveUnitState({ sessionId: selectedSessionId, unit: nextUnit });
    },
    [selectedSessionId],
  );

  const workspaceLoadError = workspaceShellQuery.isError
    ? workspaceShellQuery.error.message
    : aiWorkspaceQuery.isError
      ? aiWorkspaceQuery.error.message
      : unitQuery.isError
        ? unitQuery.error.message
        : null;
  const retryWorkspaceShell = workspaceShellQuery.refetch;
  const retryAiWorkspace = aiWorkspaceQuery.refetch;
  const retryUnit = unitQuery.refetch;
  const retryWorkspaceLoad = useCallback(() => {
    if (workspaceShellQuery.isError) void retryWorkspaceShell();
    if (aiWorkspaceQuery.isError) void retryAiWorkspace();
    if (unitQuery.isError) void retryUnit();
  }, [
    aiWorkspaceQuery.isError,
    retryAiWorkspace,
    retryUnit,
    retryWorkspaceShell,
    unitQuery.isError,
    workspaceShellQuery.isError,
  ]);

  const mode: WorkspaceMode = isHistorySelected
    ? "history"
    : resolvedOnboardingState
      ? "onboarding"
      : workspaceLoadError
        ? "idle"
        : aiWorkspace?.projectComplete
          ? "complete"
          : liveUnit
            ? "unit"
            : "idle";

  const unitAdvanceGate =
    aiWorkspace?.unitAdvanceGate ?? LOCKED_UNIT_ADVANCE_GATE;
  const attemptStartedAt =
    aiWorkspace?.evaluationProgress?.attemptStartedAt?.getTime() ?? null;
  const runningEvaluationPlan =
    aiWorkspace?.evaluationPlan && attemptStartedAt != null
      ? aiWorkspace.evaluationPlan
      : null;

  return {
    aiWorkspace,
    activeNode,
    activeNodeId,
    attemptStartedAt,
    chatHistoryQuery,
    isHistorySelected,
    isInitialSession,
    liveUnit,
    mode,
    onUnitStateChange,
    resolvedChatHistory,
    resolvedOnboardingState,
    runningEvaluationPlan,
    selectedProject,
    serverProjects,
    unitAdvanceGate,
    unitPreparing,
    workspaceLoadError,
    retryWorkspaceLoad,
    workspaceShellQuery,
  };
}
