"use client";

import { cn } from "@acme/ui";
import { WorkspaceStatusLine } from "@acme/ui/chat";

/**
 * The single "we're working on your next unit" surface. A bordered rectangle
 * (coss Frame shape — border + panel, no card chrome) holding one status line:
 * the circular dot-matrix indicator plus shimmering label, same treatment the
 * reasoning UI uses. Every place that used to hand-roll a "Preparing…" box
 * should render this so the wording, motion and tone stay in one file.
 */
export function PreparingPanel({
  label = "Preparing unit",
  detail,
  active = true,
  className,
}: {
  label?: string;
  detail?: string;
  /** false renders the label as a settled reveal instead of a live shimmer. */
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("border-foreground/[0.08] border px-7 py-6", className)}>
      <WorkspaceStatusLine label={label} active={active} />
      {detail ? (
        <p className="text-foreground/52 mt-3 text-[13px] leading-6">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
