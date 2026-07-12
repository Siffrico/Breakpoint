"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lightbulb, SidebarSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import type {
  UnitCoachCommandIntent,
  UnitCoachTrigger,
} from "~/features/training/lib/unit-coach-commands";
import { useLocalStorage } from "~/hooks/use-local-storage";
import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "./assistant-rich-text";
import { WorkspaceHeaderTimer } from "./workspace-header-timer";

const CurriculumSidebar = dynamic(() =>
  import("./curriculum-sidebar").then((mod) => mod.CurriculumSidebar),
);
const EducationUnitWorkspace = dynamic(() =>
  import("./education-unit/education-unit-workspace").then(
    (mod) => mod.EducationUnitWorkspace,
  ),
);
const OnboardingShell = dynamic(() =>
  import("./onboarding-shell").then((mod) => mod.OnboardingShell),
);
const UnitCoachPanel = dynamic(() =>
  import("./unit-coach-panel").then((mod) => mod.UnitCoachPanel),
);
const ChatHistoryView = dynamic(() =>
  import("./chat-history-view").then((mod) => mod.ChatHistoryView),
);

type WorkspaceState = RouterOutputs["training"]["home"];
type PlanState = RouterOutputs["training"]["activePlan"];
type EducationUnit = RouterOutputs["training"]["unit"];
type OnboardingState = RouterOutputs["training"]["onboardingState"];
type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
type EvaluationPlan = NonNullable<AiWorkspace["evaluationPlan"]>;
type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];
type ChatHistory = RouterOutputs["training"]["chatHistory"];
type WorkspaceBootstrap = RouterOutputs["training"]["workspaceBootstrap"];

const LAST_SESSION_COOKIE = "bp-last-learning-session";
const EMPTY_PROJECTS: LearningProject[] = [];
const MAX_COACH_ANSWER_CHARS = 3_200;

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

type WorkspaceMode = "history" | "onboarding" | "unit" | "idle";
type WorkspaceTheme = "light" | "dark" | "warm";

export function WorkspaceShell({
  workspace,
  plan: _plan,
  unit,
  onboardingState,
  aiWorkspace,
  projects = EMPTY_PROJECTS,
  sessionId,
  preview = false,
  userName,
  chatHistory = null,
  initialActiveNodeId = null,
}: {
  workspace: WorkspaceState | null;
  plan: PlanState | null;
  unit: EducationUnit | null;
  onboardingState: OnboardingState | null;
  aiWorkspace?: AiWorkspace | null;
  projects?: LearningProject[];
  sessionId: string;
  preview?: boolean;
  userName?: string;
  chatHistory?: ChatHistory | null;
  initialActiveNodeId?: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState(sessionId);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    chatHistory?.node.id ?? null,
  );
  const [pendingBootstrapSessionId, setPendingBootstrapSessionId] = useState<
    string | null
  >(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
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
    unit,
  });
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [onboardingTurnCount, setOnboardingTurnCount] = useState(0);
  const [workspaceTheme, setWorkspaceTheme] = useLocalStorage<WorkspaceTheme>(
    "bp-workspace-theme",
    "warm",
  );
  const selectedProject = projects.find(
    (project) => project.sessionId === selectedSessionId,
  );
  const isInitialSession = selectedSessionId === sessionId;
  const isOnboardingProject = Boolean(
    selectedProject && selectedProject.status !== "active",
  );
  const bootstrapQuery = useQuery(
    trpc.training.workspaceBootstrap.queryOptions(
      { sessionId: selectedSessionId },
      { enabled: false, retry: false },
    ),
  );
  const selectedBootstrap =
    bootstrapQuery.data?.kind !== "needs-onboarding" &&
    bootstrapQuery.data?.sessionId === selectedSessionId
      ? bootstrapQuery.data
      : null;
  const bootstrapPending = pendingBootstrapSessionId === selectedSessionId;
  const planQuery = useQuery(
    trpc.training.activePlan.queryOptions(
      { sessionId: selectedSessionId },
      {
        enabled:
          !preview &&
          !isInitialSession &&
          !isOnboardingProject &&
          !bootstrapPending,
        retry: false,
      },
    ),
  );
  const workspaceQuery = useQuery(
    trpc.training.home.queryOptions(
      { sessionId: selectedSessionId },
      {
        enabled:
          !preview &&
          !isInitialSession &&
          !isOnboardingProject &&
          !bootstrapPending,
        retry: false,
      },
    ),
  );
  const onboardingQuery = useQuery(
    trpc.training.onboardingState.queryOptions(
      { sessionId: selectedSessionId },
      {
        enabled:
          !preview &&
          !isInitialSession &&
          isOnboardingProject &&
          !bootstrapPending,
        retry: false,
      },
    ),
  );
  const resolvedPlan = isInitialSession ? _plan : (planQuery.data ?? null);
  const resolvedWorkspace = isInitialSession
    ? workspace
    : (workspaceQuery.data ?? null);
  const resolvedOnboardingState = isInitialSession
    ? onboardingState
    : (onboardingQuery.data ?? null);

  // History classification must not depend on the aiWorkspace query below —
  // fetching aiWorkspace can trigger server-side unit generation, so it has to
  // stay disabled while a read-only transcript is open. The initial session
  // uses the server's exact classification (which did consult aiWorkspace);
  // client-navigated projects fall back to plan/home reads, which misses only
  // the active-recall edge (that chat renders as a transcript instead of live).
  const fallbackActiveNodeId =
    (isInitialSession ? initialActiveNodeId : null) ??
    (selectedBootstrap?.kind === "workspace"
      ? selectedBootstrap.activeNodeId
      : null) ??
    resolvedWorkspace?.nextUnitId ??
    resolvedPlan?.nextUnitId ??
    null;
  const isHistorySelected = Boolean(
    selectedChatId && selectedChatId !== fallbackActiveNodeId,
  );
  const aiWorkspaceQuery = useQuery(
    trpc.training.aiWorkspace.queryOptions(
      { sessionId: selectedSessionId },
      {
        // History views are static reads; fetching (or UNIT_PREPARING polling)
        // would re-trigger server-side unit generation for no reason.
        enabled:
          !preview &&
          !isOnboardingProject &&
          !isHistorySelected &&
          !bootstrapPending,
        initialData: isInitialSession && aiWorkspace ? aiWorkspace : undefined,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: false,
        refetchInterval: (query) =>
          isUnitPreparingError(query.state.error) ? 60_000 : false,
      },
    ),
  );
  const resolvedAiWorkspace =
    aiWorkspaceQuery.data ?? (isInitialSession ? aiWorkspace : null) ?? null;
  const activeNodeId =
    resolvedAiWorkspace?.state?.recallUnitId ??
    resolvedAiWorkspace?.state?.activeUnitId ??
    fallbackActiveNodeId;
  const activeNode = activeNodeId
    ? (resolvedPlan?.nodes.find((node) => node.id === activeNodeId) ?? null)
    : null;
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
          !bootstrapPending &&
          Boolean(activeNode),
        initialData:
          isInitialSession && unit?.nodeId === activeNode?.id
            ? (unit ?? undefined)
            : undefined,
        retry: false,
      },
    ),
  );
  const fetchedUnit = unitQuery.data ?? (isInitialSession ? unit : null);
  const liveUnit =
    liveUnitState.sessionId === selectedSessionId &&
    liveUnitState.unit?.nodeId === fetchedUnit?.nodeId
      ? liveUnitState.unit
      : fetchedUnit;
  const workspaceError =
    aiWorkspaceQuery.failureReason ?? aiWorkspaceQuery.error;
  const unitPreparing = isUnitPreparingError(workspaceError);
  const preparingNodeId = getUnitPreparingNodeId(workspaceError);
  useEffect(() => {
    if (!unitPreparing || !preparingNodeId || preview || isHistorySelected)
      return;

    const events = new EventSource(
      `/api/workspace/events?sessionId=${encodeURIComponent(selectedSessionId)}&nodeId=${encodeURIComponent(preparingNodeId)}`,
    );
    const handleUnitReady = () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.training.aiWorkspace.queryKey({
          sessionId: selectedSessionId,
        }),
      });
    };
    events.addEventListener("unit_ready", handleUnitReady);

    return () => {
      events.removeEventListener("unit_ready", handleUnitReady);
      events.close();
    };
  }, [
    isHistorySelected,
    preview,
    preparingNodeId,
    queryClient,
    selectedSessionId,
    trpc.training.aiWorkspace,
    unitPreparing,
  ]);

  useEffect(() => {
    document.cookie = `${LAST_SESSION_COOKIE}=${selectedSessionId}; path=/; SameSite=Lax`;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("session")) {
      params.set("session", selectedSessionId);
      window.history.replaceState(null, "", `/workspace?${params.toString()}`);
    }
  }, [selectedSessionId]);

  const mode: WorkspaceMode = isHistorySelected
    ? "history"
    : resolvedOnboardingState
      ? "onboarding"
      : liveUnit
        ? "unit"
        : "idle";
  // Education units are not timed under the v4 FSM — the server never emits an
  // evaluationPlan for them — so this resolves to null and the timer stays
  // dormant. Sourced from the server field (rather than a literal null) so the
  // timer code paths remain type-valid if timed scenarios are reintroduced.
  const activeEvaluationPlan: EvaluationPlan | null =
    resolvedAiWorkspace?.evaluationPlan ?? null;
  const unitAdvanceGate = resolvedAiWorkspace?.unitAdvanceGate ?? {
    status: "locked",
  };
  const canAdvanceUnit =
    mode === "unit" && unitAdvanceGate.status === "enabled";
  const advanceCompletedUnit = useMutation(
    trpc.training.advanceCompletedUnit.mutationOptions({
      onSuccess: (result) => {
        if (!result.advanced && result.missionRequired) {
          router.push(
            `/workspace/mission?unitRunId=${encodeURIComponent(result.unitRunId)}`,
          );
          return;
        }
        // router.refresh() re-renders the RSC (new `unit` prop), but the
        // aiWorkspace query is frozen at staleTime: Infinity and initialData
        // never overwrites a populated cache — without this invalidation the
        // workspace would keep showing the finished unit forever.
        void queryClient.invalidateQueries({
          queryKey: trpc.training.aiWorkspace.queryKey({
            sessionId: selectedSessionId,
          }),
        });
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const timerIsActive = activeEvaluationPlan != null;
  const attemptStartedAt =
    resolvedAiWorkspace?.evaluationProgress?.attemptStartedAt?.getTime() ??
    null;
  const runningEvaluationPlan =
    timerIsActive && attemptStartedAt != null ? activeEvaluationPlan : null;

  useEffect(() => {
    setIsSessionRunning(false);
  }, [mode, selectedSessionId]);

  // Auto-collapse the sidebar to a rail when entering onboarding for a new
  // topic, and auto-expand once the curriculum is ready and we move on.
  const lastModeRef = useRef<WorkspaceMode | null>(null);
  useEffect(() => {
    const prev = lastModeRef.current;
    lastModeRef.current = mode;
    if (prev === mode) return;
    if (mode === "onboarding") {
      setSidebarCollapsed(true);
    } else if (prev === "onboarding") {
      setSidebarCollapsed(false);
    }
  }, [mode]);

  // Reset the onboarding turn counter when the session or mode changes so the
  // header doesn't display a stale count between sessions.
  useEffect(() => {
    setOnboardingTurnCount(0);
  }, [mode, selectedSessionId]);

  const handleExitOnboarding = () => {
    router.push("/");
  };

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
        : (liveUnit?.title ??
          resolvedWorkspace?.nextUnitTitle ??
          "Preparing your next unit");

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

  const toggleUnitCoach = () => {
    setUnitCoachTrigger(null);
    setUnitCoachOpen((open) => (unitCoachFocused ? true : !open));
  };

  const handleAdvanceCompletedUnit = () => {
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
  };

  const handleUnitStateChange = useCallback(
    (nextUnit: EducationUnit) => {
      setLiveUnitState({ sessionId: selectedSessionId, unit: nextUnit });
    },
    [selectedSessionId],
  );

  const seedWorkspaceCaches = useCallback(
    (bootstrap: WorkspaceBootstrap) => {
      queryClient.setQueryData(
        trpc.training.listLearningProjects.queryKey(),
        bootstrap.projects,
      );
      if (bootstrap.kind === "needs-onboarding") return;
      if (bootstrap.kind === "onboarding") {
        queryClient.setQueryData(
          trpc.training.onboardingState.queryKey({
            sessionId: bootstrap.sessionId,
          }),
          bootstrap.onboardingState,
        );
        return;
      }

      const input = { sessionId: bootstrap.sessionId };
      queryClient.setQueryData(
        trpc.training.activePlan.queryKey(input),
        bootstrap.plan,
      );
      queryClient.setQueryData(
        trpc.training.home.queryKey(input),
        bootstrap.workspace,
      );
      if (bootstrap.aiWorkspace) {
        queryClient.setQueryData(
          trpc.training.aiWorkspace.queryKey(input),
          bootstrap.aiWorkspace,
        );
      }
      if (bootstrap.unit) {
        queryClient.setQueryData(
          trpc.training.unit.queryKey({
            sessionId: bootstrap.sessionId,
            nodeId: bootstrap.unit.nodeId,
          }),
          bootstrap.unit,
        );
      }
    },
    [queryClient, trpc],
  );

  const loadWorkspaceSession = useCallback(
    async (nextSessionId: string) => {
      if (nextSessionId === sessionId) return;
      setPendingBootstrapSessionId(nextSessionId);
      try {
        const bootstrap = await queryClient.fetchQuery(
          trpc.training.workspaceBootstrap.queryOptions(
            { sessionId: nextSessionId },
            // fetchQuery does not inherit the useQuery retry setting; without
            // this a failed switch backs off through three retries before the
            // error toast appears.
            { retry: false },
          ),
        );
        seedWorkspaceCaches(bootstrap);
        if (bootstrap.kind === "needs-onboarding") {
          router.push("/onboarding");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The learning project could not be opened.",
        );
      } finally {
        setPendingBootstrapSessionId((current) =>
          current === nextSessionId ? null : current,
        );
      }
    },
    [queryClient, router, seedWorkspaceCaches, sessionId, trpc],
  );

  const navigateWorkspace = useCallback(
    (nextSessionId: string, nextChatId: string | null) => {
      if (nextSessionId !== selectedSessionId) {
        void loadWorkspaceSession(nextSessionId);
      }
      setSelectedSessionId(nextSessionId);
      setSelectedChatId(nextChatId);
      setMobileSidebarOpen(false);

      const params = new URLSearchParams({ session: nextSessionId });
      if (nextChatId) params.set("chat", nextChatId);
      window.history.pushState(null, "", `/workspace?${params.toString()}`);
    },
    [loadWorkspaceSession, selectedSessionId],
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
      if (nextSessionId === selectedSessionId && nodeId === activeNodeId)
        return;

      void queryClient.prefetchQuery(
        trpc.training.chatHistory.queryOptions(
          { sessionId: nextSessionId, nodeId },
          { staleTime: Number.POSITIVE_INFINITY },
        ),
      );
    },
    [activeNodeId, queryClient, selectedSessionId, trpc],
  );

  const prefetchProject = useCallback(
    (nextSessionId: string) => {
      if (nextSessionId === selectedSessionId) return;
      const project = projects.find(
        (candidate) => candidate.sessionId === nextSessionId,
      );
      if (project?.status !== "active") {
        void queryClient.prefetchQuery(
          trpc.training.onboardingState.queryOptions({
            sessionId: nextSessionId,
          }),
        );
        return;
      }

      // aiWorkspace is deliberately not prefetched: fetching it can trigger
      // server-side unit generation, which a mere hover must not do. Plan and
      // home are read-only.
      void Promise.all([
        queryClient.prefetchQuery(
          trpc.training.activePlan.queryOptions({ sessionId: nextSessionId }),
        ),
        queryClient.prefetchQuery(
          trpc.training.home.queryOptions({ sessionId: nextSessionId }),
        ),
      ]);
    },
    [projects, queryClient, selectedSessionId, trpc],
  );

  const handleSelectChat = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      nextSessionId: string,
      nodeId: string,
    ) => {
      const nextChatId =
        nextSessionId === selectedSessionId && nodeId === activeNodeId
          ? null
          : nodeId;
      handleWorkspaceLink(event, nextSessionId, nextChatId);
    },
    [activeNodeId, handleWorkspaceLink, selectedSessionId],
  );

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedSessionId(params.get("session") ?? sessionId);
      setSelectedChatId(params.get("chat"));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [sessionId]);

  // Flat Mac/T3 toolbar control: a real filled *material* (subtle surface +
  // soft border + theme-specific shadow), not a transparent bordered box.
  // Surface/border/shadow come from --bp-toolbar-* vars (styles.css) that flip
  // with data-workspace-theme. 9px radius, icons brighter (foreground/70 @ 85%)
  // so they don't read as ghosted. Custom <button> so our Button's `outline`
  // variant (primary-flip hover) doesn't override these. Same h-7 size.
  const headerActionClass =
    "relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-[9px] border border-[var(--bp-toolbar-border)] bg-[var(--bp-toolbar-surface)] bg-clip-padding px-3 text-sm font-medium text-foreground shadow-[var(--bp-toolbar-shadow)] outline-none transition-colors hover:bg-[var(--bp-toolbar-surface-hover)] focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='opacity-'])]:opacity-85 [&_svg:not([class*='text-'])]:text-foreground/70";

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={workspaceTheme}
    >
      <div
        inert={sidebarCollapsed ? true : undefined}
        className={[
          "hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] md:block",
          sidebarCollapsed ? "w-0" : "bg-sidebar w-[220px]",
        ].join(" ")}
      >
        <div className="h-full w-[220px]">
          <CurriculumSidebar
            projects={projects}
            currentSessionId={selectedSessionId}
            preview={preview}
            collapsed={false}
            onToggleCollapsed={toggleSidebar}
            userName={userName}
            activeLessonId={
              resolvedChatHistory?.node.id ?? liveUnit?.nodeId ?? null
            }
            isSessionRunning={isSessionRunning}
            workspaceTheme={workspaceTheme}
            onWorkspaceThemeChange={setWorkspaceTheme}
            onSelectProject={handleSelectProject}
            onPrefetchProject={prefetchProject}
            onSelectChat={handleSelectChat}
            onPrefetchChat={prefetchChat}
          />
        </div>
      </div>

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="bg-foreground/20 absolute inset-0 backdrop-blur-[1px]"
            onClick={closeMobileSidebar}
          />
          <div
            className="bg-sidebar relative h-full w-[min(86vw,320px)] shadow-2xl"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                setMobileSidebarOpen(false);
              }
            }}
          >
            <CurriculumSidebar
              projects={projects}
              currentSessionId={selectedSessionId}
              preview={preview}
              collapsed={false}
              onToggleCollapsed={closeMobileSidebar}
              userName={userName}
              activeLessonId={
                resolvedChatHistory?.node.id ?? liveUnit?.nodeId ?? null
              }
              isSessionRunning={isSessionRunning}
              workspaceTheme={workspaceTheme}
              onWorkspaceThemeChange={setWorkspaceTheme}
              onNavigate={closeMobileSidebar}
              onSelectProject={handleSelectProject}
              onPrefetchProject={prefetchProject}
              onSelectChat={handleSelectChat}
              onPrefetchChat={prefetchChat}
            />
          </div>
        </div>
      ) : null}

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col md:border-l">
        <header className="border-foreground/[0.08] relative flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
              className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors outline-none focus:outline-none focus-visible:outline-none md:hidden"
            >
              <SidebarSimple size={15} />
            </button>
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] -ml-1.5 hidden size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors outline-none focus:outline-none focus-visible:outline-none md:flex"
              >
                <SidebarSimple size={15} />
              </button>
            ) : null}
            {mode === "onboarding" ? (
              <>
                <h1 className="font-display text-foreground/82 text-[14px] tracking-[-0.01em]">
                  Defining your track
                </h1>
                <span
                  aria-live="polite"
                  className="text-foreground/40 text-[11px]"
                >
                  {isSessionRunning
                    ? "Still calibrating..."
                    : onboardingTurnCount > 0
                      ? `Question ${onboardingTurnCount + 1}`
                      : "Tell me who you want to become"}
                </span>
              </>
            ) : (
              <h1 className="font-display text-foreground min-w-0 text-[16px] tracking-[-0.02em]">
                <AssistantRichText
                  content={shellTitle}
                  className="overflow-hidden [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap"
                />
              </h1>
            )}
          </div>

          {runningEvaluationPlan && attemptStartedAt != null ? (
            <WorkspaceHeaderTimer
              plan={runningEvaluationPlan}
              attemptStartedAt={attemptStartedAt}
            />
          ) : null}

          {mode === "onboarding" && manualSetupHref ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleExitOnboarding}
                className="text-foreground/52 hover:text-foreground hover:bg-foreground/[0.04] h-7 rounded-none px-2 text-[12px] before:rounded-none"
              >
                Exit
              </Button>
              <Button
                render={<Link href={manualSetupHref} />}
                variant="outline"
                size="sm"
                className="border-foreground/12 bg-background text-foreground/72 hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground h-7 rounded-none px-2.5 text-[12px] before:rounded-none"
              >
                Do manually
              </Button>
            </div>
          ) : mode === "unit" && liveUnit ? (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={toggleUnitCoach}
                aria-label="Ask coach"
                className={headerActionClass}
              >
                <Lightbulb weight="regular" />
                <span className="hidden sm:inline">Ask coach</span>
              </button>
              <button
                type="button"
                aria-label={
                  advanceCompletedUnit.isPending ? "Advancing" : "Next Unit"
                }
                disabled={
                  preview ||
                  isSessionRunning ||
                  !canAdvanceUnit ||
                  advanceCompletedUnit.isPending
                }
                onClick={handleAdvanceCompletedUnit}
                title={
                  canAdvanceUnit
                    ? unitAdvanceGate.nextTitle
                      ? `Continue to ${unitAdvanceGate.nextTitle}`
                      : "Continue"
                    : "Complete this unit to unlock"
                }
                className={headerActionClass}
              >
                <span className="hidden sm:inline">
                  {advanceCompletedUnit.isPending
                    ? "Advancing..."
                    : "Next Unit"}
                </span>
                <ArrowRight weight="regular" className="-ml-1" />
              </button>
            </div>
          ) : null}
        </header>

        <div className="relative flex min-h-0 flex-1">
          <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {!unitCoachFocused && (
                <main
                  className={[
                    "flex min-w-0 flex-1 flex-col",
                    mode === "onboarding"
                      ? "min-h-0 overflow-hidden"
                      : "overflow-y-auto px-6 pt-1 pb-2 sm:px-10 sm:pt-2",
                  ].join(" ")}
                >
                  <div
                    className={
                      mode === "onboarding"
                        ? "flex min-h-0 w-full flex-1 flex-col"
                        : mode === "unit" || mode === "history"
                          ? "flex min-h-full flex-col"
                          : "bp-prose flex min-h-full flex-col"
                    }
                  >
                    {mode === "history" && resolvedChatHistory ? (
                      <ChatHistoryView
                        messages={resolvedChatHistory.messages}
                        currentChatHref={
                          preview
                            ? "/ui/workspace"
                            : `/workspace?session=${encodeURIComponent(selectedSessionId)}`
                        }
                        onBackToCurrentChat={(event) =>
                          handleWorkspaceLink(event, selectedSessionId, null)
                        }
                      />
                    ) : null}

                    {mode === "history" && !resolvedChatHistory ? (
                      <div className="text-foreground/48 py-16 text-center text-[13px]">
                        {chatHistoryQuery.isError
                          ? chatHistoryQuery.error.message
                          : "Loading chat..."}
                      </div>
                    ) : null}

                    {mode === "onboarding" && resolvedOnboardingState ? (
                      <OnboardingShell
                        // OnboardingShell seeds its session id and transcript
                        // from props on mount only; without the key, switching
                        // between two onboarding projects would keep chatting
                        // against the previous session.
                        key={selectedSessionId}
                        embedded
                        variant="landscape"
                        initialState={resolvedOnboardingState}
                        sessionId={selectedSessionId}
                        onRunningChange={setIsSessionRunning}
                        onTurnCountChange={setOnboardingTurnCount}
                      />
                    ) : null}

                    {mode === "unit" && liveUnit ? (
                      <EducationUnitWorkspace
                        // Remount on session switch so refs (pending turn ids,
                        // drafts) never leak across projects, matching the old
                        // full-page-navigation semantics.
                        key={selectedSessionId}
                        unit={liveUnit}
                        sessionId={selectedSessionId}
                        preview={preview}
                        embedded
                        aiWorkspace={resolvedAiWorkspace}
                        onStateChange={handleUnitStateChange}
                        onRunningChange={setIsSessionRunning}
                        onRunCommand={openUnitCoachWithCommand}
                        onAskCoachAboutAnswer={openUnitCoachForAnswer}
                        onAskCoachAboutSelection={openUnitCoachForSelection}
                      />
                    ) : null}

                    {mode === "idle" ? (
                      <div className="flex min-h-[60vh] flex-col justify-center">
                        <div className="border-foreground/[0.08] border px-7 py-6">
                          <h2 className="font-display text-foreground text-base font-semibold tracking-[-0.02em]">
                            <AssistantRichText
                              content={
                                resolvedWorkspace?.nextUnitTitle ??
                                "Preparing your next unit"
                              }
                            />
                          </h2>
                          <div className="text-foreground/52 mt-3 text-[13px] leading-6">
                            <AssistantRichText
                              content={
                                unitPreparing
                                  ? "Your next learning step is being prepared. This page will continue automatically."
                                  : "Your next learning step is being prepared."
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </main>
              )}

              {unitCoachOpen && liveUnit ? (
                <div
                  className={[
                    "min-w-0 transition-[width] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    unitCoachFocused ? "w-full" : "w-[380px]",
                  ].join(" ")}
                >
                  <UnitCoachPanel
                    key={`${selectedSessionId}:${liveUnit.nodeId}`}
                    unit={liveUnit}
                    sessionId={selectedSessionId}
                    trigger={unitCoachTrigger}
                    preview={preview}
                    isFocused={unitCoachFocused}
                    onClose={closeUnitCoach}
                    onToggleFocus={toggleUnitCoachFocus}
                    onReturnToUnit={returnToUnit}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
