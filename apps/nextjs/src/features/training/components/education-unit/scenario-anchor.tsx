"use client";

/**
 * The pinned header of the unit workspace: unit title, current learning mode,
 * and review progress stay anchored while exchanges cycle below.
 *
 * The scenario itself is not summarised here. It is a full read behind the
 * anchor's toggle — the header states where you are, the panel states what you
 * were asked to do, and neither paraphrases the other.
 */

const STAGE_LABELS: Record<string, string> = {
  learning: "Mentoring",
  review: "Review",
  recall: "Recall",
  complete: "Complete",
};

export function ScenarioAnchor({
  title,
  stage,
  isScenarioOpen,
  onToggleScenario,
  columnClassName,
}: {
  title: string;
  stage: string | null;
  /** Null when this turn has no showable scenario — the toggle is then absent. */
  isScenarioOpen: boolean | null;
  onToggleScenario: () => void;
  columnClassName: string;
}) {
  const stageLabel = stage
    ? (STAGE_LABELS[stage] ??
      stage.charAt(0).toUpperCase() + stage.slice(1).replaceAll("_", " "))
    : null;

  return (
    <div className="border-foreground/[0.08] bg-background/95 shrink-0 border-b backdrop-blur-sm">
      <div className={`${columnClassName} py-2.5 font-sans`}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-foreground/86 min-w-0 truncate text-[13px] font-medium">
            {title}
          </span>

          <div className="flex shrink-0 items-center gap-3">
            {isScenarioOpen !== null ? (
              <button
                type="button"
                onClick={onToggleScenario}
                aria-expanded={isScenarioOpen}
                className="border-foreground/[0.12] text-foreground/72 hover:border-foreground/25 hover:text-foreground/92 rounded-full border px-2.5 py-0.5 text-[11px] leading-4 transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-current motion-reduce:transition-none"
              >
                {isScenarioOpen ? "Back to chat" : "See scenario"}
              </button>
            ) : null}
            {stageLabel ? (
              <span className="border-foreground/[0.12] text-foreground/56 rounded-full border px-2.5 py-0.5 text-[11px] leading-4">
                {stageLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
