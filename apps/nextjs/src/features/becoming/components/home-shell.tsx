"use client";

import { useRouter } from "next/navigation";

import type { RouterOutputs } from "@acme/api";

import { ForgeWorkspace } from "./forge/forge-workspace";
import { CurriculumSidebar } from "./curriculum-sidebar";

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

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-60 shrink-0 overflow-y-auto border-r border-border">
        <CurriculumSidebar
          home={home}
          plan={plan}
          sessionId={sessionId}
          preview={preview}
        />
      </div>

      {/* Main panel */}
      <main className="flex-1 overflow-y-auto px-6 py-8 pb-64 sm:px-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {unit ? (
            <ForgeWorkspace
              unit={unit}
              sessionId={sessionId}
              preview={preview}
              embedded
              onNavigate={handleNavigate}
            />
          ) : (
            <div className="border-b border-border/50 pb-6">
              <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                Next module
              </div>
              <h2 className="font-display mt-3 text-xl tracking-[-0.03em]">
                {home.nextUnitTitle ?? "Preparing your next unit"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Your next unit is being prepared. Come back in a moment.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
