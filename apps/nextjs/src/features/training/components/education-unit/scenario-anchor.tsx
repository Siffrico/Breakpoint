"use client";

/**
 * The pinned header of the unit workspace: unit title and run kind stay
 * anchored while exchanges cycle below.
 *
 * The scenario itself is not summarised here. It is a full read behind the
 * anchor's trigger — the header states where you are, the peek states what you
 * were asked to do, and neither paraphrases the other.
 */
import type { ReactNode } from "react";

// "Main" is the default state of every unit, so labelling it says nothing —
// only a run that departs from the main line earns a badge.
const RUN_KIND_LABELS: Record<string, string> = {
  recall: "Recall",
};

export function ScenarioAnchor({
  title,
  runKind,
  scenarioTrigger,
  columnClassName,
}: {
  title: string;
  runKind: string | null;
  /** Null when this turn has no showable scenario — the trigger is then absent. */
  scenarioTrigger: ReactNode;
  columnClassName: string;
}) {
  const runKindLabel = runKind ? (RUN_KIND_LABELS[runKind] ?? null) : null;

  return (
    <div className="border-foreground/[0.08] bg-background/95 shrink-0 border-b backdrop-blur-sm">
      <div className={`${columnClassName} py-2.5 font-sans`}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-foreground/86 min-w-0 truncate text-[13px] font-medium">
            {title}
          </span>

          <div className="flex shrink-0 items-center gap-3">
            {scenarioTrigger}
            {runKindLabel ? (
              <span className="border-foreground/[0.12] text-foreground/56 rounded-full border px-2.5 py-0.5 text-[11px] leading-4">
                {runKindLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
