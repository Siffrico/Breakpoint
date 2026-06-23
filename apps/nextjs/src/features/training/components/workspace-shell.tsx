"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lightbulb, SidebarSimple } from "@phosphor-icons/react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { useLocalStorage } from "~/hooks/use-local-storage";
import { AssistantRichText } from "./assistant-rich-text";

const CapstoneWorkspace = dynamic(() =>
  import("./capstone/capstone-workspace").then((mod) => mod.CapstoneWorkspace),
);
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
const UnitQuestionPanel = dynamic(() =>
  import("./unit-question-panel").then((mod) => mod.UnitQuestionPanel),
);

type WorkspaceState = RouterOutputs["training"]["home"];
type PlanState = RouterOutputs["training"]["activePlan"];
type EducationUnit = RouterOutputs["training"]["unit"];
type CapstoneState = RouterOutputs["training"]["getCapstone"];
type OnboardingState = RouterOutputs["training"]["onboardingState"];
type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
type EvaluationPlan = NonNullable<AiWorkspace["evaluationPlan"]>;
type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const LAST_SESSION_COOKIE = "bp-last-learning-session";
const EMPTY_PROJECTS: LearningProject[] = [];

type WorkspaceMode = "onboarding" | "unit" | "capstone" | "idle";
type WorkspaceTheme = "light" | "dark" | "warm";
interface EvaluationTimerSnapshot {
  elapsedSeconds: number;
  timeLimitSeconds: number;
  overrunSeconds: number;
  wasOverTime: boolean;
  pausedSeconds: number;
}

const formatTimerSeconds = (seconds: number) => {
  const sign = seconds < 0 ? "-" : "";
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;

  return `${sign}${minutes}:${remainder.toString().padStart(2, "0")}`;
};

export function WorkspaceShell({
  workspace,
  plan: _plan,
  unit,
  capstone,
  onboardingState,
  aiWorkspace,
  projects = EMPTY_PROJECTS,
  sessionId,
  preview = false,
  userName,
}: {
  workspace: WorkspaceState | null;
  plan: PlanState | null;
  unit: EducationUnit | null;
  capstone: CapstoneState | null;
  onboardingState: OnboardingState | null;
  aiWorkspace?: AiWorkspace | null;
  projects?: LearningProject[];
  sessionId: string;
  preview?: boolean;
  userName?: string;
}) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };
  const [questionPanelOpen, setQuestionPanelOpen] = useState(false);
  const [questionPanelFocused, setQuestionPanelFocused] = useState(false);
  const [liveUnit, setLiveUnit] = useState(unit);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [onboardingTurnCount, setOnboardingTurnCount] = useState(0);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [workspaceTheme, setWorkspaceTheme] = useLocalStorage<WorkspaceTheme>(
    "bp-workspace-theme",
    "warm",
  );

  useEffect(() => {
    document.cookie = `${LAST_SESSION_COOKIE}=${sessionId}; path=/; SameSite=Lax`;
  }, [sessionId]);

  useEffect(() => {
    setLiveUnit(unit);
  }, [unit]);

  const mode: WorkspaceMode = onboardingState
    ? "onboarding"
    : liveUnit
      ? "unit"
      : capstone
        ? "capstone"
        : "idle";
  const latestAssistantSequence =
    aiWorkspace?.messages
      .filter((message) => message.role === "assistant")
      .at(-1)?.sequence ?? null;
  const activeEducationState =
    aiWorkspace?.state?.mode === "education_unit" ? aiWorkspace.state : null;
  const activeEvaluationPlan: EvaluationPlan | null =
    mode === "unit" &&
    activeEducationState &&
    (activeEducationState.educationStage === "performance_evaluation" ||
      activeEducationState.educationStage === "transfer_scenario")
      ? (aiWorkspace?.evaluationPlan ?? null)
      : null;
  const canRequestNextScenario =
    aiWorkspace?.evaluationProgress?.canRequestNextScenario ?? false;
  const timerIsActive = activeEvaluationPlan != null && !canRequestNextScenario;
  const runningEvaluationPlan = timerIsActive ? activeEvaluationPlan : null;
  const timerKey = timerIsActive
    ? [
        sessionId,
        activeEducationState?.activeUnitId,
        activeEducationState?.educationStage,
        latestAssistantSequence,
        activeEvaluationPlan.mode,
        activeEvaluationPlan.timeLimitSeconds,
      ].join(":")
    : null;
  const timerKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setIsSessionRunning(false);
  }, [mode, sessionId]);

  useEffect(() => {
    if (!timerKey) {
      timerKeyRef.current = null;
      setTimerStartedAt(null);
      return;
    }

    if (timerKeyRef.current === timerKey) return;

    const now = Date.now();
    timerKeyRef.current = timerKey;
    setTimerStartedAt(now);
    setTimerNow(now);
  }, [timerKey]);

  useEffect(() => {
    if (!timerIsActive || timerStartedAt == null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [timerIsActive, timerStartedAt]);

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
  }, [mode, sessionId]);

  const handleExitOnboarding = () => {
    router.push("/");
  };

  const manualSetupHref =
    mode === "onboarding"
      ? preview
        ? "/ui/profile/projects"
        : `/profile/projects?session=${encodeURIComponent(sessionId)}`
      : null;

  const shellTitle =
    mode === "onboarding"
      ? (onboardingState?.activeQuestion?.prompt ??
        "Start a new learning track")
      : mode === "capstone"
        ? (capstone?.capstone.scenario.title ?? "Cluster capstone")
        : (liveUnit?.title ??
          workspace?.nextUnitTitle ??
          "Preparing your next unit");

  const closeQuestionPanel = () => {
    setQuestionPanelFocused(false);
    setQuestionPanelOpen(false);
  };

  const toggleQuestionPanelFocus = () => {
    setQuestionPanelOpen(true);
    setQuestionPanelFocused((prev) => !prev);
  };
  const elapsedSeconds =
    timerStartedAt == null ? 0 : Math.floor((timerNow - timerStartedAt) / 1000);
  const remainingSeconds = runningEvaluationPlan
    ? runningEvaluationPlan.timeLimitSeconds - elapsedSeconds
    : 0;
  const timerSnapshot: EvaluationTimerSnapshot | null = runningEvaluationPlan
    ? {
        elapsedSeconds,
        timeLimitSeconds: runningEvaluationPlan.timeLimitSeconds,
        overrunSeconds: Math.max(
          0,
          elapsedSeconds - runningEvaluationPlan.timeLimitSeconds,
        ),
        wasOverTime: elapsedSeconds > runningEvaluationPlan.timeLimitSeconds,
        pausedSeconds: 0,
      }
    : null;

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={workspaceTheme}
    >
      <div
        inert={sidebarCollapsed ? true : undefined}
        className={[
          "shrink-0 overflow-hidden transition-[width] duration-200",
          sidebarCollapsed ? "w-0" : "bg-sidebar w-[232px]",
        ].join(" ")}
      >
        <div className="h-full w-[232px]">
          <CurriculumSidebar
            projects={projects}
            currentSessionId={sessionId}
            preview={preview}
            collapsed={false}
            onToggleCollapsed={toggleSidebar}
            userName={userName}
            activeLessonId={liveUnit?.nodeId ?? null}
            isSessionRunning={isSessionRunning}
            workspaceTheme={workspaceTheme}
            onWorkspaceThemeChange={setWorkspaceTheme}
          />
        </div>
      </div>

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col border-l">
        <header className="relative flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] -ml-1.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
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
              <h1 className="font-display text-foreground text-[16px] tracking-[-0.02em]">
                <AssistantRichText
                  content={shellTitle}
                  className="overflow-hidden [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap"
                />
              </h1>
            )}
          </div>

          {runningEvaluationPlan ? (
            <div className="text-foreground/76 absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[13px] tabular-nums">
              <span aria-live="polite">
                {formatTimerSeconds(remainingSeconds)}
              </span>
            </div>
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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() =>
                  setQuestionPanelOpen((prev) =>
                    questionPanelFocused ? true : !prev,
                  )
                }
                className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 rounded-none px-3 text-[12px] before:rounded-none"
              >
                <Lightbulb size={15} weight="fill" />
                Ask
              </Button>
            </div>
          ) : null}
        </header>

        <div className="relative flex min-h-0 flex-1">
          <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {!questionPanelFocused && (
                <main
                  className={[
                    "flex min-w-0 flex-1 flex-col",
                    mode === "onboarding"
                      ? "min-h-0 overflow-hidden"
                      : "overflow-y-auto px-6 pt-1 pb-6 sm:px-10 sm:pt-2",
                  ].join(" ")}
                >
                  <div
                    className={
                      mode === "onboarding"
                        ? "flex min-h-0 w-full flex-1 flex-col"
                        : mode === "unit"
                          ? "flex min-h-full flex-col"
                          : "bp-prose flex min-h-full flex-col"
                    }
                  >
                    {mode === "onboarding" && onboardingState ? (
                      <OnboardingShell
                        embedded
                        variant="landscape"
                        initialState={onboardingState}
                        sessionId={sessionId}
                        onRunningChange={setIsSessionRunning}
                        onTurnCountChange={setOnboardingTurnCount}
                      />
                    ) : null}

                    {mode === "unit" && liveUnit ? (
                      <EducationUnitWorkspace
                        unit={liveUnit}
                        sessionId={sessionId}
                        preview={preview}
                        embedded
                        aiWorkspace={aiWorkspace ?? null}
                        canRequestNextScenario={canRequestNextScenario}
                        attemptTiming={timerSnapshot}
                        onStateChange={setLiveUnit}
                        onRunningChange={setIsSessionRunning}
                      />
                    ) : null}

                    {mode === "capstone" && capstone ? (
                      <CapstoneWorkspace
                        state={capstone}
                        sessionId={sessionId}
                        embedded
                        onRunningChange={setIsSessionRunning}
                      />
                    ) : null}

                    {mode === "idle" ? (
                      <div className="flex min-h-[60vh] flex-col justify-center">
                        <div className="border-foreground/[0.08] border px-7 py-6">
                          <h2 className="font-display text-foreground text-base font-semibold tracking-[-0.02em]">
                            <AssistantRichText
                              content={
                                workspace?.nextUnitTitle ??
                                "Preparing your next unit"
                              }
                            />
                          </h2>
                          <div className="text-foreground/52 mt-3 text-[13px] leading-6">
                            <AssistantRichText content="Your next learning step is being prepared." />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </main>
              )}

              {questionPanelOpen && liveUnit ? (
                <div
                  className={[
                    "min-w-0 transition-[width] duration-200",
                    questionPanelFocused ? "w-full" : "w-[380px]",
                  ].join(" ")}
                >
                  <UnitQuestionPanel
                    unit={liveUnit}
                    isFocused={questionPanelFocused}
                    onClose={closeQuestionPanel}
                    onToggleFocus={toggleQuestionPanelFocus}
                    onReturnToUnit={() => setQuestionPanelFocused(false)}
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
