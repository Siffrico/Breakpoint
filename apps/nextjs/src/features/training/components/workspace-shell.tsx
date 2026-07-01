"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lightbulb, SidebarSimple } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

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

type WorkspaceState = RouterOutputs["training"]["home"];
type PlanState = RouterOutputs["training"]["activePlan"];
type EducationUnit = RouterOutputs["training"]["unit"];
type OnboardingState = RouterOutputs["training"]["onboardingState"];
type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
type EvaluationPlan = NonNullable<AiWorkspace["evaluationPlan"]>;
type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const LAST_SESSION_COOKIE = "bp-last-learning-session";
const EMPTY_PROJECTS: LearningProject[] = [];
const MAX_COACH_ANSWER_CHARS = 3_200;

type WorkspaceMode = "onboarding" | "unit" | "idle";
type WorkspaceTheme = "light" | "dark" | "warm";
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
  onboardingState: OnboardingState | null;
  aiWorkspace?: AiWorkspace | null;
  projects?: LearningProject[];
  sessionId: string;
  preview?: boolean;
  userName?: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

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
  const [liveUnit, setLiveUnit] = useState(unit);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [onboardingTurnCount, setOnboardingTurnCount] = useState(0);
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
      : "idle";
  // Education units are not timed under the v4 FSM — the server never emits an
  // evaluationPlan for them — so this resolves to null and the timer stays
  // dormant. Sourced from the server field (rather than a literal null) so the
  // timer code paths remain type-valid if timed scenarios are reintroduced.
  const activeEvaluationPlan: EvaluationPlan | null =
    aiWorkspace?.evaluationPlan ?? null;
  const canRequestNextScenario =
    aiWorkspace?.evaluationProgress?.canRequestNextScenario ?? false;
  const unitAdvanceGate = aiWorkspace?.unitAdvanceGate ?? { status: "locked" };
  const canAdvanceUnit =
    mode === "unit" && unitAdvanceGate.status === "enabled";
  const advanceCompletedUnit = useMutation(
    trpc.training.advanceCompletedUnit.mutationOptions({
      onSuccess: () => {
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const timerIsActive = activeEvaluationPlan != null && !canRequestNextScenario;
  const attemptStartedAt =
    aiWorkspace?.evaluationProgress?.attemptStartedAt?.getTime() ?? null;
  const runningEvaluationPlan =
    timerIsActive && attemptStartedAt != null ? activeEvaluationPlan : null;

  useEffect(() => {
    setIsSessionRunning(false);
  }, [mode, sessionId]);

  useEffect(() => {
    if (!timerIsActive || attemptStartedAt == null) {
      return;
    }

    setTimerNow(Date.now());
    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [timerIsActive, attemptStartedAt]);

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
      : (liveUnit?.title ??
        workspace?.nextUnitTitle ??
        "Preparing your next unit");

  const closeUnitCoach = () => {
    setUnitCoachFocused(false);
    setUnitCoachOpen(false);
    setUnitCoachTrigger(null);
  };

  const toggleUnitCoachFocus = () => {
    setUnitCoachOpen(true);
    setUnitCoachFocused((focused) => !focused);
  };

  const openUnitCoachWithCommand = (intent: UnitCoachCommandIntent) => {
    if (!liveUnit) return;
    setUnitCoachOpen(true);
    setUnitCoachTrigger((previous) => ({
      intent,
      nonce: (previous?.nonce ?? 0) + 1,
      unitId: liveUnit.nodeId,
    }));
  };

  const openUnitCoachForAnswer = (answer: string) => {
    if (!liveUnit) return;

    const excerpt = answer.trim().slice(0, MAX_COACH_ANSWER_CHARS);
    setUnitCoachOpen(true);
    setUnitCoachTrigger((previous) => ({
      intent: "freeform",
      message: `Help me improve this submitted answer without rewriting it for me. Identify the weakest reasoning, then ask one focused question.\n\nSubmitted answer:\n${excerpt}`,
      nonce: (previous?.nonce ?? 0) + 1,
      unitId: liveUnit.nodeId,
    }));
  };

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
      sessionId,
      nodeId: unitAdvanceGate.unitId,
    });
  };
  const elapsedSeconds =
    attemptStartedAt == null
      ? 0
      : Math.max(0, Math.floor((timerNow - attemptStartedAt) / 1000));
  const remainingSeconds = runningEvaluationPlan
    ? runningEvaluationPlan.timeLimitSeconds - elapsedSeconds
    : 0;

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
          "hidden shrink-0 overflow-hidden transition-[width] duration-200 md:block",
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

      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            className="bg-foreground/20 absolute inset-0 backdrop-blur-[1px]"
            onClick={() => setMobileSidebarOpen(false)}
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
              currentSessionId={sessionId}
              preview={preview}
              collapsed={false}
              onToggleCollapsed={() => setMobileSidebarOpen(false)}
              userName={userName}
              activeLessonId={liveUnit?.nodeId ?? null}
              isSessionRunning={isSessionRunning}
              workspaceTheme={workspaceTheme}
              onWorkspaceThemeChange={setWorkspaceTheme}
              onNavigate={() => setMobileSidebarOpen(false)}
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

          {runningEvaluationPlan ? (
            <div
              className="text-foreground/76 absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[13px] tabular-nums"
              title="Continuous timer: leaving or reloading does not pause it."
            >
              <span aria-live="polite">
                {formatTimerSeconds(remainingSeconds)}
              </span>
              <span className="text-foreground/38 font-sans text-[10px] tracking-wide uppercase">
                No pause
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
                        onStateChange={setLiveUnit}
                        onRunningChange={setIsSessionRunning}
                        onRunCommand={openUnitCoachWithCommand}
                        onAskCoachAboutAnswer={openUnitCoachForAnswer}
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

              {unitCoachOpen && liveUnit ? (
                <div
                  className={[
                    "min-w-0 transition-[width] duration-200",
                    unitCoachFocused ? "w-full" : "w-[380px]",
                  ].join(" ")}
                >
                  <UnitCoachPanel
                    key={`${sessionId}:${liveUnit.nodeId}`}
                    unit={liveUnit}
                    sessionId={sessionId}
                    trigger={unitCoachTrigger}
                    preview={preview}
                    isFocused={unitCoachFocused}
                    onClose={closeUnitCoach}
                    onToggleFocus={toggleUnitCoachFocus}
                    onReturnToUnit={() => setUnitCoachFocused(false)}
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
