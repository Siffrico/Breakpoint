"use client";

import { Lightbulb } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

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
type LearningProject = RouterOutputs["becoming"]["listLearningProjects"][number];
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
      ? onboardingState?.activeQuestion?.prompt ?? "Start a new learning track"
      : mode === "recall"
        ? "Recall checkpoint"
        : mode === "capstone"
          ? capstone?.capstone.scenario.title ?? "Cluster capstone"
          : liveUnit?.title ?? home?.nextUnitTitle ?? "Preparing your next unit";
  const shellSubtitle =
    mode === "onboarding"
      ? "Use the same onboarding system to define a new topic and build its path."
      : mode === "recall"
        ? "One stale concept, one recall, then back into new learning."
        : mode === "capstone"
          ? "Pressure-test the cluster before moving on."
          : liveUnit?.summary ?? home?.headline ?? "Learning workspace";

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
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className={[
          "shrink-0 border-r border-foreground/[0.06] bg-sidebar transition-[width] duration-200",
          sidebarCollapsed ? "w-[56px]" : "w-[280px]",
        ].join(" ")}
      >
        <CurriculumSidebar
          home={home}
          plan={plan}
          projects={projects}
          currentSessionId={sessionId}
          preview={preview}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-foreground/[0.06] px-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate font-display text-[16px] tracking-[-0.02em] text-foreground">
              {shellTitle}
            </h1>
            <p className="truncate text-[11px] text-foreground/34">
              {shellSubtitle}
            </p>
          </div>

          {mode === "unit" && liveUnit ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {}}
                className="rounded-none border-foreground/12 bg-transparent px-3 text-[12px] text-foreground before:rounded-none before:shadow-none hover:border-foreground/24 hover:bg-transparent hover:text-foreground"
              >
                Hint
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() =>
                  setQuestionPanelOpen((prev) => (questionPanelFocused ? true : !prev))
                }
                className="rounded-none border-primary bg-primary px-3 text-[12px] text-primary-foreground before:rounded-none hover:bg-primary/90"
              >
                <Lightbulb size={15} weight="fill" />
                Ask
              </Button>
            </div>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!questionPanelFocused && (
            <main className="min-w-0 flex-1 overflow-y-auto px-6 pt-12 pb-8 sm:px-8 sm:pt-14">
              <div className="mx-auto w-full max-w-[860px]">
                {mode === "onboarding" && onboardingState ? (
                  <OnboardingShell
                    embedded
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
                    <div className="border border-foreground/[0.08] px-7 py-6">
                      <h2 className="font-display text-base font-semibold tracking-[-0.02em] text-foreground">
                        {home?.nextUnitTitle ?? "Preparing your next unit"}
                      </h2>
                      <p className="mt-3 text-[13px] leading-6 text-foreground/52">
                        Your next learning step is being prepared.
                      </p>
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
