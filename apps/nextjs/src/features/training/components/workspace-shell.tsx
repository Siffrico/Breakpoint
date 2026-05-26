"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const LAST_SESSION_COOKIE = "bp-last-learning-session";
const EMPTY_PROJECTS: LearningProject[] = [];

type WorkspaceMode = "onboarding" | "unit" | "capstone" | "idle";
type WorkspaceTheme = "light" | "dark" | "warm";

export function WorkspaceShell({
  workspace,
  plan,
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
  const [questionPanelOpen, setQuestionPanelOpen] = useState(false);
  const [questionPanelFocused, setQuestionPanelFocused] = useState(false);
  const [liveUnit, setLiveUnit] = useState(unit);
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [onboardingTurnCount, setOnboardingTurnCount] = useState(0);
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

  useEffect(() => {
    setIsSessionRunning(false);
  }, [mode, sessionId]);

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

  return (
    <div
      className="bp-workspace-theme bg-background text-foreground flex h-dvh overflow-hidden"
      data-workspace-theme={workspaceTheme}
    >
      <div
        className={[
          "bg-sidebar shrink-0 transition-[width] duration-200",
          sidebarCollapsed ? "w-12" : "w-[232px]",
        ].join(" ")}
      >
        <CurriculumSidebar
          projects={projects}
          currentSessionId={sessionId}
          preview={preview}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() =>
            setSidebarCollapsed((prev) => !prev)
          }
          userName={userName}
          activeLessonId={liveUnit?.nodeId ?? null}
          isSessionRunning={isSessionRunning}
          workspaceTheme={workspaceTheme}
          onWorkspaceThemeChange={setWorkspaceTheme}
        />
      </div>

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col border-l">
        <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
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
              <h1
                className="font-display text-foreground text-[16px] tracking-[-0.02em]"
              >
                <AssistantRichText
                  content={shellTitle}
                  className="overflow-hidden [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap"
                />
              </h1>
            )}
          </div>

          {mode === "onboarding" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleExitOnboarding}
              className="text-foreground/52 hover:text-foreground hover:bg-foreground/[0.04] h-7 rounded-none px-2 text-[12px] before:rounded-none"
            >
              Exit
            </Button>
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

        <div className="flex min-h-0 flex-1">
          <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {!questionPanelFocused && (
                <main
                  className={[
                    "flex min-w-0 flex-1 overflow-y-auto",
                    mode === "onboarding"
                      ? "p-0"
                      : "px-6 pt-1 pb-6 sm:px-10 sm:pt-2",
                  ].join(" ")}
                >
                  <div
                    className={
                      mode === "onboarding"
                        ? "flex min-h-full w-full flex-col"
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
                          <h2
                            className="font-display text-foreground text-base font-semibold tracking-[-0.02em]"
                          >
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
