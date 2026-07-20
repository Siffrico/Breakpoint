"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@acme/ui/toast";

import type {
  ChatHistory,
  EducationUnit,
  LearningProject,
  OnboardingState,
  PlanState,
  WorkspaceMode,
} from "./use-workspace-session";
import type { WorkspaceTheme } from "./workspace-sidebar";
import type {
  UnitCoachCommandIntent,
  UnitCoachTrigger,
} from "~/features/training/lib/unit-coach-commands";
import { useLocalStorage } from "~/hooks/use-local-storage";
import { useTRPC } from "~/trpc/react";
import { useWorkspaceSession } from "./use-workspace-session";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceLiveWorkspace } from "./workspace-live-workspace";
import { WorkspaceSidebar } from "./workspace-sidebar";

const LAST_SESSION_COOKIE = "bp-last-learning-session";
const EMPTY_PROJECTS: LearningProject[] = [];
const MAX_COACH_ANSWER_CHARS = 3_200;
const LOCKED_UNIT_ADVANCE_GATE = { status: "locked" } as const;

interface AdvanceTransition {
  sessionId: string;
  completedNodeId: string;
  projectedNodeId: string;
  title: string;
}
interface AdvanceMutationContext {
  previousAdvanceTransition: AdvanceTransition | null;
  previousSelectedChatId: string | null;
  transition: AdvanceTransition;
}

export function WorkspaceShell({
  plan,
  onboardingState,
  projects = EMPTY_PROJECTS,
  sessionId,
  preview = false,
  userName,
  chatHistory = null,
}: {
  plan: PlanState | null;
  onboardingState: OnboardingState | null;
  projects?: LearningProject[];
  sessionId: string;
  preview?: boolean;
  userName?: string;
  chatHistory?: ChatHistory | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState(sessionId);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    chatHistory?.node.id ?? null,
  );
  const [advanceTransition, setAdvanceTransition] =
    useState<AdvanceTransition | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);
  const openMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(true);
  }, []);
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileSidebarOpen]);

  const [unitCoachOpen, setUnitCoachOpen] = useState(false);
  const [unitCoachFocused, setUnitCoachFocused] = useState(false);
  const [unitCoachTrigger, setUnitCoachTrigger] =
    useState<UnitCoachTrigger | null>(null);
  const [liveUnitState, setLiveUnitState] = useState({
    sessionId,
    unit: null as EducationUnit | null,
  });
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [onboardingTurnState, setOnboardingTurnState] = useState({
    count: 0,
    sessionId,
  });
  const [workspaceTheme, setWorkspaceTheme] = useLocalStorage<WorkspaceTheme>(
    "bp-workspace-theme",
    "warm",
  );
  const activeAdvanceTransition =
    advanceTransition?.sessionId === selectedSessionId
      ? advanceTransition
      : null;
  const {
    aiWorkspace,
    activeNode,
    activeNodeId,
    chatHistoryQuery,
    fetchedUnit,
    isHistorySelected,
    resolvedChatHistory,
    resolvedOnboardingState,
    selectedProject,
    serverProjects,
    unitPreparing,
    workspaceShellQuery,
  } = useWorkspaceSession({
    plan,
    onboardingState,
    projects,
    sessionId,
    selectedSessionId,
    selectedChatId,
    chatHistory,
    preview,
    activeAdvanceTransition,
  });
  const liveUnit =
    liveUnitState.sessionId === selectedSessionId &&
    liveUnitState.unit?.nodeId === fetchedUnit?.nodeId
      ? liveUnitState.unit
      : fetchedUnit;
  const mode: WorkspaceMode = isHistorySelected
    ? "history"
    : resolvedOnboardingState
      ? "onboarding"
      : liveUnit
        ? "unit"
        : "idle";
  const activeEvaluationPlan = aiWorkspace?.evaluationPlan ?? null;
  const attemptStartedAt =
    aiWorkspace?.evaluationProgress?.attemptStartedAt?.getTime() ?? null;
  const runningEvaluationPlan =
    activeEvaluationPlan && attemptStartedAt != null
      ? activeEvaluationPlan
      : null;
  const unitAdvanceGate =
    aiWorkspace?.unitAdvanceGate ?? LOCKED_UNIT_ADVANCE_GATE;
  const canAdvanceUnit =
    mode === "unit" &&
    activeAdvanceTransition == null &&
    aiWorkspace?.state?.recallUnitId == null &&
    unitAdvanceGate.status === "enabled";
  const pendingActiveLessonId =
    activeAdvanceTransition?.projectedNodeId ?? null;
  const effectiveSidebarCollapsed =
    mode === "onboarding" ? true : sidebarCollapsed;
  const onboardingTurnCount =
    onboardingTurnState.sessionId === selectedSessionId
      ? onboardingTurnState.count
      : 0;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setSidebarCollapsed(mode === "onboarding");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [mode]);

  useEffect(() => {
    if (!activeAdvanceTransition) return;

    const serverActiveNodeId = aiWorkspace?.state?.activeUnitId;
    const serverProject = serverProjects.find(
      (project) => project.sessionId === activeAdvanceTransition.sessionId,
    );
    const serverAdvanced = Boolean(
      serverActiveNodeId &&
        serverActiveNodeId !== activeAdvanceTransition.completedNodeId,
    );
    const serverProjectHasNextNode = Boolean(
      serverActiveNodeId &&
        serverProject?.lessonPreview.some(
          (lesson) => lesson.id === serverActiveNodeId,
        ),
    );

    if (serverAdvanced && serverProjectHasNextNode) {
      const frameId = window.requestAnimationFrame(() => {
        setAdvanceTransition((current) =>
          current === activeAdvanceTransition ? null : current,
        );
      });
      return () => window.cancelAnimationFrame(frameId);
    } else if (serverAdvanced) {
      void queryClient.invalidateQueries({
        queryKey: trpc.training.listLearningProjects.queryKey(),
      });
    }
  }, [
    activeAdvanceTransition,
    queryClient,
    aiWorkspace,
    serverProjects,
    trpc.training.listLearningProjects,
  ]);

  const restoreAdvanceTransition = useCallback(
    (context: AdvanceMutationContext | undefined) => {
      setAdvanceTransition(context?.previousAdvanceTransition ?? null);
      setSelectedChatId(context?.previousSelectedChatId ?? null);
    },
    [],
  );

  const advanceCompletedUnit = useMutation(
    trpc.training.advanceCompletedUnit.mutationOptions({
      onMutate: (variables): AdvanceMutationContext => {
        const previousSelectedChatId = selectedChatId;
        const nextTitle =
          unitAdvanceGate.status === "enabled"
            ? (unitAdvanceGate.nextTitle ?? "Next unit")
            : "Next unit";
        const transition: AdvanceTransition = {
          sessionId: variables.sessionId,
          completedNodeId: variables.nodeId,
          projectedNodeId: crypto.randomUUID(),
          title: nextTitle,
        };

        setAdvanceTransition(transition);
        setSelectedChatId(null);

        return {
          previousAdvanceTransition: advanceTransition,
          previousSelectedChatId,
          transition,
        };
      },
      onSuccess: (result, _variables, context) => {
        const sessionInput = {
          sessionId: context.transition.sessionId,
        };
        const workspaceKey = trpc.training.aiWorkspace.queryKey(sessionInput);
        const projectsKey = trpc.training.listLearningProjects.queryKey();

        if (!result.advanced) {
          restoreAdvanceTransition(context);
          router.push(
            `/workspace/mission?unitRunId=${encodeURIComponent(result.unitRunId)}`,
          );
          return;
        }
        if (result.nextChat) {
          const { nodeId, title } = result.nextChat;
          setAdvanceTransition((current) =>
            current === context.transition
              ? { ...current, projectedNodeId: nodeId, title }
              : current,
          );
        }
        void queryClient.invalidateQueries({ queryKey: projectsKey });
        void queryClient.invalidateQueries({
          queryKey: workspaceKey,
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.training.unit.queryKey(sessionInput),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.training.workspaceShell.queryKey(sessionInput),
        });
      },
      onError: (error, _variables, context) => {
        restoreAdvanceTransition(context);
        toast.error(error.message);
      },
    }),
  );
  useEffect(() => {
    document.cookie = `${LAST_SESSION_COOKIE}=${selectedSessionId}; path=/; SameSite=Lax`;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("session")) {
      params.set("session", selectedSessionId);
      window.history.replaceState(null, "", `/workspace?${params.toString()}`);
    }
  }, [selectedSessionId]);

  const handleExitOnboarding = useCallback(() => {
    router.push("/");
  }, [router]);
  const handleOnboardingTurnCount = useCallback(
    (count: number) => {
      setOnboardingTurnState({ count, sessionId: selectedSessionId });
    },
    [selectedSessionId],
  );

  const closeUnitCoach = useCallback(() => {
    setUnitCoachFocused(false);
    setUnitCoachOpen(false);
    setUnitCoachTrigger(null);
  }, []);

  const returnToUnit = useCallback(() => {
    setUnitCoachFocused(false);
  }, []);

  const toggleUnitCoachFocus = useCallback(() => {
    setUnitCoachOpen(true);
    setUnitCoachFocused((focused) => !focused);
  }, []);

  const openUnitCoachWithCommand = useCallback(
    (intent: UnitCoachCommandIntent) => {
      if (!liveUnit) return;
      setUnitCoachOpen(true);
      setUnitCoachTrigger((previous) => ({
        intent,
        nonce: (previous?.nonce ?? 0) + 1,
        unitId: liveUnit.nodeId,
      }));
    },
    [liveUnit],
  );

  const openUnitCoachForAnswer = useCallback(
    (answer: string) => {
      if (!liveUnit) return;

      const excerpt = answer.trim().slice(0, MAX_COACH_ANSWER_CHARS);
      setUnitCoachOpen(true);
      setUnitCoachTrigger((previous) => ({
        intent: "freeform",
        message: `Help me improve this submitted answer without rewriting it for me. Identify the weakest reasoning, then ask one focused question.\n\nSubmitted answer:\n${excerpt}`,
        nonce: (previous?.nonce ?? 0) + 1,
        unitId: liveUnit.nodeId,
      }));
    },
    [liveUnit],
  );

  const openUnitCoachForSelection = useCallback(
    (selection: string) => {
      if (!liveUnit) return;

      const excerpt = selection.trim().slice(0, MAX_COACH_ANSWER_CHARS);
      if (!excerpt) return;
      setUnitCoachOpen(true);
      setUnitCoachTrigger((previous) => ({
        intent: "freeform",
        message: `Explain this part of the lesson:\n\n"${excerpt}"`,
        nonce: (previous?.nonce ?? 0) + 1,
        unitId: liveUnit.nodeId,
      }));
    },
    [liveUnit],
  );

  const toggleUnitCoach = useCallback(() => {
    setUnitCoachTrigger(null);
    setUnitCoachOpen((open) => (unitCoachFocused ? true : !open));
  }, [unitCoachFocused]);

  const handleAdvanceCompletedUnit = useCallback(() => {
    if (
      !canAdvanceUnit ||
      preview ||
      isSessionRunning ||
      advanceCompletedUnit.isPending
    ) {
      return;
    }

    advanceCompletedUnit.mutate({
      sessionId: selectedSessionId,
      nodeId: unitAdvanceGate.unitId,
    });
  }, [
    advanceCompletedUnit,
    canAdvanceUnit,
    isSessionRunning,
    preview,
    selectedSessionId,
    unitAdvanceGate,
  ]);

  const handleUnitStateChange = useCallback(
    (nextUnit: EducationUnit) => {
      setLiveUnitState({ sessionId: selectedSessionId, unit: nextUnit });
    },
    [selectedSessionId],
  );

  const navigateWorkspace = useCallback(
    (nextSessionId: string, nextChatId: string | null) => {
      setSelectedSessionId(nextSessionId);
      setSelectedChatId(nextChatId);
      setMobileSidebarOpen(false);

      const params = new URLSearchParams({ session: nextSessionId });
      if (nextChatId) params.set("chat", nextChatId);
      window.history.pushState(null, "", `/workspace?${params.toString()}`);
    },
    [],
  );

  const handleWorkspaceLink = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      nextSessionId: string,
      nextChatId: string | null,
    ) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      navigateWorkspace(nextSessionId, nextChatId);
    },
    [navigateWorkspace],
  );

  const handleSelectProject = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, nextSessionId: string) => {
      handleWorkspaceLink(event, nextSessionId, null);
    },
    [handleWorkspaceLink],
  );

  const prefetchChat = useCallback(
    (nextSessionId: string, nodeId: string) => {
      if (
        nextSessionId === selectedSessionId &&
        nodeId === activeAdvanceTransition?.projectedNodeId
      ) {
        return;
      }
      if (nextSessionId === selectedSessionId && nodeId === activeNodeId)
        return;

      void queryClient.prefetchQuery(
        trpc.training.chatHistory.queryOptions(
          { sessionId: nextSessionId, nodeId },
          { staleTime: Number.POSITIVE_INFINITY },
        ),
      );
    },
    [
      activeAdvanceTransition?.projectedNodeId,
      activeNodeId,
      queryClient,
      selectedSessionId,
      trpc,
    ],
  );

  const prefetchProject = useCallback(
    (nextSessionId: string) => {
      if (nextSessionId === selectedSessionId) return;

      // aiWorkspace is deliberately not prefetched: fetching it can trigger
      // server-side unit generation, which a mere hover must not do. The shell
      // is read-only.
      void queryClient.prefetchQuery(
        trpc.training.workspaceShell.queryOptions(
          { sessionId: nextSessionId },
          {
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
          },
        ),
      );
    },
    [queryClient, selectedSessionId, trpc],
  );

  const handleSelectChat = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      nextSessionId: string,
      nodeId: string,
    ) => {
      const nextChatId =
        nextSessionId === selectedSessionId &&
        (nodeId === activeNodeId ||
          nodeId === activeAdvanceTransition?.projectedNodeId)
          ? null
          : nodeId;
      handleWorkspaceLink(event, nextSessionId, nextChatId);
    },
    [
      activeAdvanceTransition?.projectedNodeId,
      activeNodeId,
      handleWorkspaceLink,
      selectedSessionId,
    ],
  );
  const handleBackToCurrentChat = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      handleWorkspaceLink(event, selectedSessionId, null);
    },
    [handleWorkspaceLink, selectedSessionId],
  );

  const resolvedProjects = activeAdvanceTransition
    ? serverProjects.map((project) => {
        if (
          project.sessionId !== selectedSessionId ||
          project.lessonPreview.some(
            (lesson) => lesson.id === activeAdvanceTransition.projectedNodeId,
          )
        ) {
          return project;
        }
        return {
          ...project,
          lessonPreview: [
            {
              id: activeAdvanceTransition.projectedNodeId,
              title: activeAdvanceTransition.title,
              status: "ready" as const,
            },
            ...project.lessonPreview,
          ],
        };
      })
    : serverProjects;
  const manualSetupHref =
    mode === "onboarding"
      ? preview
        ? "/ui/profile"
        : `/settings/topics?session=${encodeURIComponent(selectedSessionId)}`
      : null;
  const shellTitle =
    mode === "history"
      ? (resolvedChatHistory?.node.title ??
        selectedProject?.lessonPreview.find(
          (lesson) => lesson.id === selectedChatId,
        )?.title ??
        "Chat history")
      : mode === "onboarding"
        ? (resolvedOnboardingState?.activeQuestion?.prompt ??
          "Start a new learning track")
        : (activeAdvanceTransition?.title ??
          liveUnit?.title ??
          activeNode?.title ??
          "Preparing your next unit");

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={workspaceTheme}
    >
      <WorkspaceSidebar
        projects={resolvedProjects}
        selectedSessionId={selectedSessionId}
        activeLessonId={
          pendingActiveLessonId ??
          resolvedChatHistory?.node.id ??
          liveUnit?.nodeId ??
          null
        }
        preview={preview}
        collapsed={effectiveSidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        userName={userName}
        isSessionRunning={isSessionRunning}
        workspaceTheme={workspaceTheme}
        onWorkspaceThemeChange={setWorkspaceTheme}
        onToggleCollapsed={toggleSidebar}
        onCloseMobile={closeMobileSidebar}
        onSelectProject={handleSelectProject}
        onPrefetchProject={prefetchProject}
        onSelectChat={handleSelectChat}
        onPrefetchChat={prefetchChat}
      />

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col md:border-l">
        <WorkspaceHeader
          mode={mode}
          title={shellTitle}
          sidebarCollapsed={effectiveSidebarCollapsed}
          isSessionRunning={isSessionRunning}
          onboardingTurnCount={onboardingTurnCount}
          manualSetupHref={manualSetupHref}
          runningEvaluationPlan={runningEvaluationPlan}
          attemptStartedAt={attemptStartedAt}
          hasLiveUnit={liveUnit != null}
          canAdvanceUnit={canAdvanceUnit}
          advancePending={advanceCompletedUnit.isPending}
          preview={preview}
          nextUnitTitle={
            unitAdvanceGate.status === "enabled"
              ? (unitAdvanceGate.nextTitle ?? undefined)
              : undefined
          }
          onOpenMobileSidebar={openMobileSidebar}
          onToggleSidebar={toggleSidebar}
          onExitOnboarding={handleExitOnboarding}
          onToggleCoach={toggleUnitCoach}
          onAdvanceUnit={handleAdvanceCompletedUnit}
        />
        <WorkspaceLiveWorkspace
          mode={mode}
          selectedSessionId={selectedSessionId}
          chatHistory={resolvedChatHistory}
          chatHistoryError={
            chatHistoryQuery.isError ? chatHistoryQuery.error.message : null
          }
          onboardingState={resolvedOnboardingState}
          liveUnit={liveUnit}
          aiWorkspace={aiWorkspace}
          activeNodeTitle={activeNode?.title ?? null}
          workspaceShellError={
            workspaceShellQuery.isError
              ? workspaceShellQuery.error.message
              : null
          }
          unitPreparing={unitPreparing}
          preview={preview}
          advancePending={activeAdvanceTransition != null}
          unitCoachOpen={unitCoachOpen}
          unitCoachFocused={unitCoachFocused}
          unitCoachTrigger={unitCoachTrigger}
          onBackToCurrentChat={handleBackToCurrentChat}
          onRunningChange={setIsSessionRunning}
          onTurnCountChange={handleOnboardingTurnCount}
          onUnitStateChange={handleUnitStateChange}
          onAdvanceUnit={handleAdvanceCompletedUnit}
          onRunCommand={openUnitCoachWithCommand}
          onAskCoachAboutAnswer={openUnitCoachForAnswer}
          onAskCoachAboutSelection={openUnitCoachForSelection}
          onCloseCoach={closeUnitCoach}
          onToggleCoachFocus={toggleUnitCoachFocus}
          onReturnToUnit={returnToUnit}
        />
      </div>
    </div>
  );
}
