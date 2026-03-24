"use client";

import { cn } from "@acme/ui";

import type { ForgePhase } from "~/features/becoming/lib/forge-preview";

const phases: { key: ForgePhase; label: string }[] = [
  { key: "seed", label: "Seed" },
  { key: "build", label: "Build" },
  { key: "practice", label: "Practice" },
  { key: "prove", label: "Prove" },
  { key: "isolation", label: "Repair" },
];

export function PhaseIndicator({
  currentPhase,
  completedPhases,
}: {
  currentPhase: ForgePhase;
  completedPhases: ForgePhase[];
}) {
  return (
    <div className="flex items-center gap-1">
      {phases.map((phase, index) => {
        const isCompleted = completedPhases.includes(phase.key);
        const isCurrent = phase.key === currentPhase;
        const isHidden = phase.key === "isolation" && !isCurrent && !isCompleted;

        if (isHidden) return null;

        return (
          <div key={phase.key} className="flex items-center gap-1">
            {index > 0 && !isHidden && (
              <div
                className={cn(
                  "h-px w-6",
                  isCompleted ? "bg-primary/50" : "bg-border",
                )}
              />
            )}
            <div
              className={cn(
                "px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] uppercase transition-colors duration-200",
                isCurrent && "border border-primary/30 bg-primary/12 text-primary",
                isCompleted && "border border-border bg-secondary text-muted-foreground",
                !isCurrent && !isCompleted && "border border-border/50 text-muted-foreground/50",
              )}
            >
              {phase.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
