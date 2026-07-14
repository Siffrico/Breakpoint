"use client";

import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";

/**
 * The pinned header of the scenario workspace: unit title, current FSM phase,
 * and scenario-attempt progress stay anchored while exchanges cycle below.
 * The checkpoint detail (current stage framing) expands on demand so it never
 * competes with the active prompt for vertical space.
 */

const STAGE_LABELS: Record<string, string> = {
  connect: "Connect",
  solve: "Solve",
  teach: "Teach",
  recall: "Recall",
  mastered: "Mastered",
};

export function ScenarioAnchor({
  title,
  stage,
  progress,
  detail,
  columnClassName,
}: {
  title: string;
  stage: string | null;
  progress: { completed: number; total: number } | null;
  detail: string | null;
  columnClassName: string;
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const stageLabel = stage
    ? (STAGE_LABELS[stage] ??
      stage.charAt(0).toUpperCase() + stage.slice(1).replaceAll("_", " "))
    : null;

  return (
    <div className="border-foreground/[0.08] bg-background/95 shrink-0 border-b backdrop-blur-sm">
      <div className={`${columnClassName} py-2.5 font-sans`}>
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => detail && setIsDetailOpen((current) => !current)}
            aria-expanded={detail ? isDetailOpen : undefined}
            disabled={!detail}
            className="text-foreground/86 flex min-w-0 items-center gap-2 text-left text-[13px] font-medium outline-none focus:outline-none"
          >
            {detail ? (
              <CaretRight
                size={11}
                weight="bold"
                className={[
                  "text-foreground/40 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
                  isDetailOpen ? "rotate-90" : "",
                ].join(" ")}
              />
            ) : null}
            <span className="truncate">{title}</span>
          </button>

          <div className="flex shrink-0 items-center gap-3">
            {stageLabel ? (
              <span className="border-foreground/[0.12] text-foreground/56 rounded-full border px-2.5 py-0.5 text-[11px] leading-4">
                {stageLabel}
              </span>
            ) : null}
            {progress && progress.total > 1 ? (
              <span
                className="flex items-center gap-1"
                aria-label={`Scenario ${Math.min(progress.completed + 1, progress.total)} of ${progress.total}`}
                title={`${progress.completed} of ${progress.total} scenarios complete`}
              >
                {Array.from({ length: progress.total }, (_, index) => (
                  <span
                    key={index}
                    className={[
                      "size-1.5 rounded-full",
                      index < progress.completed
                        ? "bg-foreground/70"
                        : "bg-foreground/[0.16]",
                    ].join(" ")}
                  />
                ))}
              </span>
            ) : null}
          </div>
        </div>

        {detail ? (
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            style={{ gridTemplateRows: isDetailOpen ? "1fr" : "0fr" }}
          >
            <div className="min-h-0 overflow-hidden">
              <p className="text-foreground/56 pt-2 pb-1 pl-[19px] text-[12.5px] leading-5 whitespace-pre-wrap">
                {detail}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
