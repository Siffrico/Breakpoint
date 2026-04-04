"use client";

import { Lightbulb } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { CurriculumSidebar } from "./curriculum-sidebar";
import { ForgeWorkspace } from "./forge/forge-workspace";
import { UnitQuestionPanel } from "./unit-question-panel";

type HomeState = RouterOutputs["becoming"]["home"];
type PlanState = RouterOutputs["becoming"]["activePlan"];
type EducationUnit = RouterOutputs["becoming"]["unit"];
type FinalizeForgeUnitResult = RouterOutputs["becoming"]["finalizeForgeUnit"];
type SubmitRecallProbeResult = RouterOutputs["becoming"]["submitRecallProbe"];

export function HomeShell({
  home,
  plan,
  unit,
  sessionId,
  preview = false,
}: {
  home: HomeState;
  plan: PlanState;
  unit: EducationUnit | null;
  sessionId: string;
  preview?: boolean;
}) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [questionPanelOpen, setQuestionPanelOpen] = useState(false);
  const [questionPanelFocused, setQuestionPanelFocused] = useState(false);
  const [liveUnit, setLiveUnit] = useState(unit);

  const shellTitle = liveUnit?.title ?? home.nextUnitTitle ?? "Preparing your next unit";
  const shellSubtitle = liveUnit?.summary ?? home.headline;

  const handleNavigate = (
    result: FinalizeForgeUnitResult | SubmitRecallProbeResult["nextAction"],
  ) => {
    if (!result) return;

    if (result.nextAction === "unit" || result.nextAction === "simulation") {
      router.push(`/train/${result.nodeId}?session=${sessionId}`);
      return;
    }

    router.push(`/home?session=${sessionId}`);
  };

  const closeQuestionPanel = () => {
    setQuestionPanelFocused(false);
    setQuestionPanelOpen(false);
  };

  const toggleQuestionPanelFocus = () => {
    setQuestionPanelOpen(true);
    setQuestionPanelFocused((prev) => !prev);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className={[
          "shrink-0 border-r border-foreground/[0.06] bg-sidebar transition-[width] duration-200",
          sidebarCollapsed ? "w-[56px]" : "w-[244px]",
        ].join(" ")}
      >
        <CurriculumSidebar
          home={home}
          plan={plan}
          sessionId={sessionId}
          preview={preview}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-foreground/[0.06] px-4 sm:px-6">
          <div className="min-w-0">
            <div className="min-w-0">
              <h1 className="truncate font-display text-[16px] tracking-[-0.02em] text-foreground">
                {shellTitle}
              </h1>
              <p className="truncate text-[11px] text-foreground/34">
                {shellSubtitle}
              </p>
            </div>
          </div>

          {liveUnit && (
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
          )}
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!questionPanelFocused && (
            <main className="min-w-0 flex-1 overflow-y-auto px-6 pt-12 pb-8 sm:px-8 sm:pt-14">
              <div className="mx-auto w-full max-w-[860px]">
                {unit ? (
                  <ForgeWorkspace
                    unit={unit}
                    sessionId={sessionId}
                    preview={preview}
                    embedded
                    onNavigate={handleNavigate}
                    onStateChange={setLiveUnit}
                  />
                ) : (
                  <div className="flex min-h-[60vh] flex-col justify-center">
                    <div className="border border-foreground/[0.08] px-7 py-6">
                      <h2 className="font-display text-base font-semibold tracking-[-0.02em] text-foreground">
                        {home.nextUnitTitle ?? "Preparing your next unit"}
                      </h2>
                      <p className="mt-3 text-[13px] leading-6 text-foreground/52">
                        Your next unit is being prepared. Come back in a moment.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </main>
          )}

          {questionPanelOpen && liveUnit && (
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
          )}
        </div>
      </div>
    </div>
  );
}
