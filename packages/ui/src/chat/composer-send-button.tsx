"use client";

import type { ReactNode } from "react";
import { ArrowUp } from "@phosphor-icons/react";

import { cn } from "@acme/ui";

export type ComposerSendRounding = "rounded" | "circular";

/**
 * The composer send control. Solid inverse material — `bg-foreground` over
 * `text-background` — so it renders as a black button on light surfaces and a
 * white button on dark ones, tracking whichever theme context it sits in
 * (global `.light`/`.dark` or the workspace's `data-workspace-theme`).
 *
 * Defaults to a squared radius sized like a normal send button; `rounding`
 * flips it to a full circle for the onboarding pill. Callers size it with
 * `className` (e.g. `size-8`), which wins over the base via tailwind-merge.
 */
export function ComposerSendButton({
  onSubmit,
  onStop,
  stopping = false,
  disabled = false,
  rounding = "rounded",
  sendLabel = "Send",
  stopLabel = "Stop",
  className,
  children,
}: {
  onSubmit: () => void;
  onStop?: () => void;
  /** When true the control shows a stop glyph and calls `onStop` instead. */
  stopping?: boolean;
  disabled?: boolean;
  /** Onboarding uses "circular"; every other composer uses "rounded". */
  rounding?: ComposerSendRounding;
  sendLabel?: string;
  stopLabel?: string;
  className?: string;
  /** Override the glyph (e.g. onboarding's send/stop/retry three-way icon). */
  children?: ReactNode;
}) {
  // Only blocked when not stopping: the stop action must stay clickable while a
  // response streams even though the composer is otherwise "disabled".
  const isDisabled = !stopping && disabled;

  return (
    <button
      data-action="prompt-submit"
      type="button"
      disabled={isDisabled}
      aria-label={stopping ? stopLabel : sendLabel}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (stopping) {
          onStop?.();
          return;
        }
        onSubmit();
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center bg-foreground text-background outline-none transition-[opacity,background-color,color] hover:opacity-90 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-foreground/[0.14] disabled:text-foreground/40 disabled:hover:opacity-100",
        rounding === "circular" ? "rounded-full" : "rounded-lg",
        className,
      )}
    >
      {children ??
        (stopping ? (
          <span aria-hidden="true" className="size-2.5 rounded-[1px] bg-current" />
        ) : (
          <ArrowUp weight="bold" className="size-4" />
        ))}
    </button>
  );
}
