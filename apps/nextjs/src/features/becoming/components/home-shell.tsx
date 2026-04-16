"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { AssistantRichText } from "./assistant-rich-text";
import { CapstoneWorkspace } from "./capstone/capstone-workspace";
import { CurriculumSidebar } from "./curriculum-sidebar";
import { ForgeWorkspace } from "./forge/forge-workspace";
import { OnboardingShell } from "./onboarding-shell";
import { RecallGateView } from "./recall/RecallGateView";
import { UnitQuestionPanel } from "./unit-question-panel";

type HomeState = RouterOutputs["becoming"]["home"];
type PlanState = RouterOutputs["becoming"]["activePlan"];
type EducationUnit = RouterOutputs["becoming"]["unit"];
type CapstoneState = RouterOutputs["becoming"]["getCapstone"];
type OnboardingState = RouterOutputs["becoming"]["onboardingState"];
type RecallGate = RouterOutputs["becoming"]["getRecallGate"];
type LearningProject =
  RouterOutputs["becoming"]["listLearningProjects"][number];
type FinalizeForgeUnitResult = RouterOutputs["becoming"]["finalizeForgeUnit"];
type SubmitRecallProbeResult = RouterOutputs["becoming"]["submitRecallProbe"];

const LAST_SESSION_COOKIE = "bp-last-learning-session";

type WorkspaceMode = "onboarding" | "recall" | "unit" | "capstone" | "idle";

export function HomeShell({
  home,
  plan,
  unit,
  capstone,
  onboardingState,
  recallGate,
  projects = [],
  sessionId,
  preview = false,
  userName,
}: {
  home: HomeState | null;
  plan: PlanState | null;
  unit: EducationUnit | null;
  capstone: CapstoneState | null;
  onboardingState: OnboardingState | null;
  recallGate: RecallGate | null;
  projects?: LearningProject[];
  sessionId: string;
  preview?: boolean;
  userName?: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [questionPanelOpen, setQuestionPanelOpen] = useState(false);
  const [questionPanelFocused, setQuestionPanelFocused] = useState(false);
  const [liveUnit, setLiveUnit] = useState(unit);
  const [liveRecallGate, setLiveRecallGate] = useState(recallGate);

  useEffect(() => {
    document.cookie = `${LAST_SESSION_COOKIE}=${sessionId}; path=/; SameSite=Lax`;
  }, [sessionId]);

  useEffect(() => {
    setLiveUnit(unit);
  }, [unit]);

  useEffect(() => {
    setLiveRecallGate(recallGate);
  }, [recallGate]);

  const submitRecallProbe = useMutation(
    trpc.becoming.submitRecallProbe.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  const mode: WorkspaceMode = onboardingState
    ? "onboarding"
    : liveRecallGate
      ? "recall"
      : liveUnit
        ? "unit"
        : capstone
          ? "capstone"
          : "idle";

  const shellTitle =
    mode === "onboarding"
      ? (onboardingState?.activeQuestion?.prompt ??
        "Start a new learning track")
      : mode === "recall"
        ? "Recall checkpoint"
        : mode === "capstone"
          ? (capstone?.capstone.scenario.title ?? "Cluster capstone")
          : (liveUnit?.title ??
            home?.nextUnitTitle ??
            "Preparing your next unit");
  const shellSubtitle =
    mode === "onboarding"
      ? "Use the same onboarding system to define a new topic and build its path."
      : mode === "recall"
        ? "One stale concept, one recall, then back into new learning."
        : mode === "capstone"
          ? "Pressure-test the cluster before moving on."
          : (liveUnit?.summary ?? home?.headline ?? "Learning workspace");

  const handleNavigate = (
    result: FinalizeForgeUnitResult | SubmitRecallProbeResult["nextAction"],
  ) => {
    if (!result) return;

    if (result.nextAction === "recall_gate") {
      setLiveRecallGate(result.gate);
      return;
    }

    router.push(`/home?session=${sessionId}`);
    router.refresh();
  };

  const closeQuestionPanel = () => {
    setQuestionPanelFocused(false);
    setQuestionPanelOpen(false);
  };

  const toggleQuestionPanelFocus = () => {
    setQuestionPanelOpen(true);
    setQuestionPanelFocused((prev) => !prev);
  };

  const handleRecallProbeSubmit = async (
    probeId: string,
    mode: "probe" | "repair",
    response: string,
  ) => {
    if (!liveRecallGate || preview) return;

    const result = await submitRecallProbe.mutateAsync({
      gateId: liveRecallGate.id,
      probeId,
      mode,
      response,
    });

    setLiveRecallGate(result.gate);
    if (result.nextAction) {
      handleNavigate(result.nextAction);
    }
  };

  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <div
        className={[
          "border-foreground/[0.06] bg-sidebar shrink-0 border-r transition-[width] duration-200",
          sidebarCollapsed ? "w-[56px]" : "w-[200px]",
        ].join(" ")}
      >
        <CurriculumSidebar
          projects={projects}
          currentSessionId={sessionId}
          preview={preview}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
          userName={userName}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {mode === "onboarding" ? null : (
        <header className="border-foreground/[0.06] flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <div className="min-w-0">
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
            <div className="text-foreground/34 text-[11px]">
              <AssistantRichText
                content={shellSubtitle}
                className="overflow-hidden [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap"
              />
            </div>
          </div>

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
        </header>
        )}

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
                  />
                ) : null}

                {mode === "recall" && liveRecallGate ? (
                  <RecallGateView
                    gate={liveRecallGate}
                    onSubmitProbe={handleRecallProbeSubmit}
                    isPending={submitRecallProbe.isPending}
                    onContinue={() => {
                      router.push(`/home?session=${sessionId}`);
                      router.refresh();
                    }}
                  />
                ) : null}

                {mode === "unit" && liveUnit ? (
                  <ForgeWorkspace
                    unit={liveUnit}
                    sessionId={sessionId}
                    preview={preview}
                    embedded
                    onNavigate={handleNavigate}
                    onStateChange={setLiveUnit}
                  />
                ) : null}

                {mode === "capstone" && capstone ? (
                  <CapstoneWorkspace
                    state={capstone}
                    sessionId={sessionId}
                    embedded
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
                            home?.nextUnitTitle ?? "Preparing your next unit"
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
  );
}
