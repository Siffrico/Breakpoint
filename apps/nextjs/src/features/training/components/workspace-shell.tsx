"use client";

import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  ChatHistory,
  LearningProject,
  OnboardingState,
  PlanState,
} from "./use-workspace-session";
import type { WorkspaceTheme } from "./workspace-sidebar";
import { useLocalStorage } from "~/hooks/use-local-storage";
import { useAdvanceController } from "./use-advance-controller";
import { useUnitCoachController } from "./use-unit-coach-controller";
import { useWorkspaceNavigation } from "./use-workspace-navigation";
import { useWorkspaceSession } from "./use-workspace-session";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceLiveWorkspace } from "./workspace-live-workspace";
import { WorkspaceSidebar } from "./workspace-sidebar";

const EMPTY_PROJECTS: LearningProject[] = [];

/**
 * Composition root for the workspace. State lives in the controllers —
 * navigation, view model, coach, advance — and this component only wires
 * them together, keeps the cross-controller glue (guards that need both the
 * live node and the pending advance), and lays out the frame.
 */
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
  const recallAdvanceRef = useRef<(() => void) | null>(null);
  const onRecallAdvanceReady = useCallback((next: (() => void) | null) => {
    recallAdvanceRef.current = next;
  }, []);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [onboardingTurnState, setOnboardingTurnState] = useState({
    count: 0,
    sessionId,
  });
  const [workspaceTheme, setWorkspaceTheme] = useLocalStorage<WorkspaceTheme>(
    "bp-workspace-theme",
    "warm",
  );

  const nav = useWorkspaceNavigation({
    initialSessionId: sessionId,
    initialChatId: chatHistory?.node.id ?? null,
  });
  const vm = useWorkspaceSession({
    plan,
    onboardingState,
    projects,
    sessionId,
    selectedSessionId: nav.selectedSessionId,
    selectedChatId: nav.selectedChatId,
    chatHistory,
    preview,
  });
  const coach = useUnitCoachController(vm.liveUnit?.nodeId ?? null);
  const advance = useAdvanceController({
    selectedSessionId: nav.selectedSessionId,
    selectedChatId: nav.selectedChatId,
    setSelectedChatId: nav.setSelectedChatId,
    aiWorkspace: vm.aiWorkspace,
    serverProjects: vm.serverProjects,
    unitAdvanceGate: vm.unitAdvanceGate,
    mode: vm.mode,
    isHistorySelected: vm.isHistorySelected,
    isSessionRunning,
    preview,
  });

  const { setSidebarCollapsed } = nav;
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setSidebarCollapsed(vm.mode === "onboarding");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [vm.mode, setSidebarCollapsed]);
  const effectiveSidebarCollapsed =
    vm.mode === "onboarding" ? true : nav.sidebarCollapsed;
  const onboardingTurnCount =
    onboardingTurnState.sessionId === nav.selectedSessionId
      ? onboardingTurnState.count
      : 0;

  const handleExitOnboarding = useCallback(() => {
    router.push("/");
  }, [router]);
  const handleOnboardingTurnCount = useCallback(
    (count: number) => {
      setOnboardingTurnState({ count, sessionId: nav.selectedSessionId });
    },
    [nav.selectedSessionId],
  );

  // Cross-controller glue: whether a chat link points at the chat that is
  // already live needs the view model's active node and the advance
  // controller's projected node, so it composes here rather than in either.
  const isLiveChatNode = useCallback(
    (targetSessionId: string, nodeId: string) =>
      targetSessionId === nav.selectedSessionId &&
      (nodeId === vm.activeNodeId || nodeId === advance.pendingNodeId),
    [advance.pendingNodeId, nav.selectedSessionId, vm.activeNodeId],
  );
  const prefetchChat = useCallback(
    (nextSessionId: string, nodeId: string) => {
      if (isLiveChatNode(nextSessionId, nodeId)) return;
      nav.prefetchChatHistory(nextSessionId, nodeId);
    },
    [isLiveChatNode, nav],
  );
  const handleSelectChat = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      nextSessionId: string,
      nodeId: string,
    ) => {
      nav.handleLink(
        event,
        nextSessionId,
        isLiveChatNode(nextSessionId, nodeId) ? null : nodeId,
      );
    },
    [isLiveChatNode, nav],
  );
  const handleSelectProject = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, nextSessionId: string) => {
      nav.handleLink(event, nextSessionId, null);
    },
    [nav],
  );
  const handleBackToCurrentChat = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      nav.handleLink(event, nav.selectedSessionId, null);
    },
    [nav],
  );

  const manualSetupHref =
    vm.mode === "onboarding"
      ? preview
        ? "/ui/profile"
        : `/settings/topics?session=${encodeURIComponent(nav.selectedSessionId)}`
      : null;
  const shellTitle = vm.recallTask
    ? "Recall"
    : vm.mode === "history"
      ? (vm.resolvedChatHistory?.node.title ??
        vm.selectedProject?.lessonPreview.find(
          (lesson) => lesson.id === nav.selectedChatId,
        )?.title ??
        "Chat history")
      : vm.mode === "onboarding"
        ? (vm.resolvedOnboardingState?.activeQuestion?.prompt ??
          "Start a new learning track")
        : vm.mode === "complete"
          ? "Project complete"
          : (advance.activeTransition?.title ??
            vm.liveUnit?.title ??
            vm.activeNode?.title ??
            "Preparing your next unit");

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={workspaceTheme}
    >
      <WorkspaceSidebar
        projects={advance.resolvedProjects}
        selectedSessionId={nav.selectedSessionId}
        activeLessonId={
          advance.pendingNodeId ??
          vm.resolvedChatHistory?.node.id ??
          vm.liveUnit?.nodeId ??
          null
        }
        preview={preview}
        collapsed={effectiveSidebarCollapsed}
        mobileOpen={nav.mobileSidebarOpen}
        userName={userName}
        isSessionRunning={isSessionRunning}
        workspaceTheme={workspaceTheme}
        onWorkspaceThemeChange={setWorkspaceTheme}
        onToggleCollapsed={nav.toggleSidebar}
        onCloseMobile={nav.closeMobileSidebar}
        onSelectProject={handleSelectProject}
        onPrefetchProject={nav.prefetchProject}
        onSelectChat={handleSelectChat}
        onPrefetchChat={prefetchChat}
      />

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col md:border-l">
        <WorkspaceHeader
          mode={vm.mode}
          title={shellTitle}
          sidebarCollapsed={effectiveSidebarCollapsed}
          isSessionRunning={isSessionRunning}
          onboardingTurnCount={onboardingTurnCount}
          manualSetupHref={manualSetupHref}
          hasLiveUnit={vm.liveUnit != null}
          canAdvanceUnit={advance.canAdvance}
          advancePending={advance.isPending}
          preview={preview}
          nextUnitTitle={
            vm.unitAdvanceGate.status === "enabled"
              ? (vm.unitAdvanceGate.nextTitle ?? undefined)
              : undefined
          }
          onOpenMobileSidebar={nav.openMobileSidebar}
          onToggleSidebar={nav.toggleSidebar}
          onExitOnboarding={handleExitOnboarding}
          onToggleCoach={coach.toggle}
          onAdvanceUnit={() => {
            if (vm.recallTask) recallAdvanceRef.current?.();
            else advance.advance();
          }}
        />
        <WorkspaceLiveWorkspace
          mode={vm.mode}
          selectedSessionId={nav.selectedSessionId}
          chatHistory={vm.resolvedChatHistory}
          chatHistoryError={
            vm.chatHistoryQuery.isError
              ? vm.chatHistoryQuery.error.message
              : null
          }
          onboardingState={vm.resolvedOnboardingState}
          liveUnit={vm.liveUnit}
          aiWorkspace={vm.aiWorkspace}
          activeNodeTitle={vm.activeNode?.title ?? null}
          workspaceLoadError={vm.workspaceLoadError}
          unitPreparationFailure={vm.unitPreparationFailure}
          unitPreparing={vm.unitPreparing}
          unitPreparationRetryPending={vm.unitPreparationRetryPending}
          preview={preview}
          advancePending={advance.activeTransition != null}
          recallTask={vm.recallTask}
          recallBoundaryNodeId={vm.recallBoundaryNodeId}
          onRecallAdvanceReady={onRecallAdvanceReady}
          coach={coach}
          onBackToCurrentChat={handleBackToCurrentChat}
          onRetryWorkspace={vm.retryWorkspaceLoad}
          onRetryUnitPreparation={vm.retryUnitPreparation}
          onRunningChange={setIsSessionRunning}
          onTurnCountChange={handleOnboardingTurnCount}
          onUnitStateChange={vm.onUnitStateChange}
          onAdvanceUnit={advance.advance}
        />
      </div>
    </div>
  );
}
