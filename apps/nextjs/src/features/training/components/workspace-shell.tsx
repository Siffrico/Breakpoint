"use client";

import { useEffect, useState } from "react";
import { Lightbulb, SidebarSimple } from "@phosphor-icons/react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { AssistantRichText } from "./assistant-rich-text";
import { CapstoneWorkspace } from "./capstone/capstone-workspace";
import { CurriculumSidebar } from "./curriculum-sidebar";
import { EducationUnitWorkspace } from "./education-unit/education-unit-workspace";
import { OnboardingShell } from "./onboarding-shell";
import { UnitQuestionPanel } from "./unit-question-panel";

type WorkspaceState = RouterOutputs["training"]["home"];
type PlanState = RouterOutputs["training"]["activePlan"];
type EducationUnit = RouterOutputs["training"]["unit"];
type CapstoneState = RouterOutputs["training"]["getCapstone"];
type OnboardingState = RouterOutputs["training"]["onboardingState"];
type AiWorkspace = RouterOutputs["training"]["aiWorkspace"];
type LearningProject =
  RouterOutputs["training"]["listLearningProjects"][number];

const LAST_SESSION_COOKIE = "bp-last-learning-session";

type WorkspaceMode = "onboarding" | "unit" | "capstone" | "idle";

export function WorkspaceShell({
  workspace,
  plan,
  unit,
  capstone,
  onboardingState,
  aiWorkspace,
  projects = [],
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [questionPanelOpen, setQuestionPanelOpen] = useState(false);
  const [questionPanelFocused, setQuestionPanelFocused] = useState(false);
  const [liveUnit, setLiveUnit] = useState(unit);
  const [isSessionRunning, setIsSessionRunning] = useState(false);

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
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      {!sidebarCollapsed ? (
        <div className="bg-sidebar w-[232px] shrink-0">
          <CurriculumSidebar
            projects={projects}
            currentSessionId={sessionId}
            preview={preview}
            onToggleCollapsed={() => setSidebarCollapsed(true)}
            userName={userName}
            activeLessonId={liveUnit?.nodeId ?? null}
            isSessionRunning={isSessionRunning}
          />
        </div>
      ) : null}

      <div className="border-foreground/[0.08] flex min-w-0 flex-1 flex-col border-l">
        <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {sidebarCollapsed ? (
              <button
                type="button"
                aria-label="Open sidebar"
                onClick={() => setSidebarCollapsed(false)}
                className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] transition-colors outline-none focus:outline-none focus-visible:outline-none"
              >
                <SidebarSimple size={14} />
              </button>
            ) : null}

            {mode === "onboarding" ? null : (
              <div
                role="heading"
                aria-level={1}
                className="font-display text-foreground text-[16px] tracking-[-0.02em]"
              >
                <AssistantRichText
                  content={shellTitle}
                  className="overflow-hidden [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap"
                />
              </div>
            )}
          </div>

          {mode === "onboarding" ? null : (
            <>
              {mode === "unit" && liveUnit ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {}}
                    className="border-foreground/12 text-foreground hover:border-foreground/24 hover:text-foreground rounded-none bg-transparent px-3 text-[12px] before:rounded-none before:shadow-none hover:bg-transparent"
                  >
                    Hint
                  </Button>
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
            </>
          )}
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
                          <div
                            role="heading"
                            aria-level={2}
                            className="font-display text-foreground text-base font-semibold tracking-[-0.02em]"
                          >
                            <AssistantRichText
                              content={
                                workspace?.nextUnitTitle ??
                                "Preparing your next unit"
                              }
                            />
                          </div>
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
