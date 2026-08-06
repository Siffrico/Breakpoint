"use client";

import { useState } from "react";
import { ArrowClockwise, ArrowRight } from "@phosphor-icons/react";

import type { ProjectBuildState } from "@acme/api/onboarding-chat";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";

import { AiLoader } from "./ai-loader";

/** The build is a chat-scoped stream, so this is an overlay on the onboarding
 *  shell rather than a route — navigating away would unmount `useChat` and kill
 *  the stream mid-build. */
export function ProjectBuildScreen({
  state,
  preview = false,
  onStartLearning,
  onSeeOverview,
  onRetry,
  onRegenerateOverview,
  startPending = false,
  retryDisabled = false,
}: {
  state: ProjectBuildState;
  preview?: boolean;
  onStartLearning: () => void;
  onSeeOverview: () => void;
  onRetry?: () => void;
  onRegenerateOverview?: () => void;
  startPending?: boolean;
  retryDisabled?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  const isComplete = state.phase === "complete";
  const isError = state.phase === "error";
  const statusOf = (id: string) =>
    state.steps.find((step) => step.id === id)?.status;

  // Overview is best-effort: the curriculum can be finished and usable while it
  // is still being written, so it never gates "Start learning".
  const overviewMissing = state.gaps?.includes("overview") ?? false;
  const overviewGenerating = isComplete && statusOf("overview") === "active";
  const activeLabel = state.steps.find(
    (step) => step.status === "active",
  )?.label;

  // A build that reached the first unit is usable even if a later step failed.
  const canStart = Boolean(state.sessionId && state.firstUnitId);

  if (dismissed && (isComplete || isError)) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-[#1a3379] via-[#0f172a] to-black px-6 py-16 text-white">
      <div className="flex w-full max-w-[46ch] flex-col items-center text-center">
        <div className="font-mono text-[11px] tracking-[0.14em] text-white/40 uppercase">
          {isError ? "Stopped" : isComplete ? "Ready" : "Building"}
          {state.projectName ? ` · ${state.projectName}` : null}
        </div>

        {!isComplete && !isError ? (
          <>
            <div className="mt-8">
              <AiLoader />
            </div>
            <div className="mt-8 text-[15px] leading-6 text-white/85">
              {activeLabel ?? "Preparing your build"}
            </div>
            {state.modules.length > 0 ? (
              <div className="mt-2 font-mono text-[11px] text-white/40">
                {state.modules.length} skills so far
              </div>
            ) : null}
            <p className="mt-8 text-[13px] leading-6 text-white/45">
              This takes a couple of minutes. You can switch tabs — it keeps
              going, and picks up where it left off if anything drops.
            </p>
          </>
        ) : null}

        {isComplete ? (
          <>
            <h1 className="animate-in fade-in slide-in-from-bottom-2 mt-6 text-[25px] font-medium tracking-[-0.02em] duration-500">
              Your curriculum is ready
            </h1>
            <ol className="mt-8 flex w-full flex-col gap-2 text-left">
              {state.modules.map((title, index) => (
                <li
                  key={`${index}-${title}`}
                  className="animate-in fade-in slide-in-from-bottom-1 flex gap-3 text-[14px] leading-6 text-white/80 duration-500"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="font-mono text-[11px] text-white/35 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {title}
                </li>
              ))}
            </ol>

            {overviewGenerating ? (
              <div className="mt-6 font-mono text-[11px] text-white/40">
                Overview still writing in the background
              </div>
            ) : null}

            {overviewMissing ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-white/50">
                Overview didn&apos;t finish.
                {onRegenerateOverview ? (
                  <button
                    type="button"
                    onClick={onRegenerateOverview}
                    disabled={preview}
                    className="inline-flex items-center gap-1 font-medium text-white/80 hover:text-white disabled:opacity-50"
                  >
                    <ArrowClockwise size={11} weight="bold" />
                    Write it
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {isError ? (
          <>
            <h1 className="mt-6 text-[25px] font-medium tracking-[-0.02em]">
              {activeLabel
                ? `Stopped while ${activeLabel.replace(/^\w/, (c) => c.toLowerCase())}`
                : "The build stopped early"}
            </h1>

            <ul className="mt-8 flex w-full flex-col gap-2 text-left font-mono text-[12px]">
              {[
                {
                  label:
                    state.modules.length > 0
                      ? `${state.modules.length} skills`
                      : "curriculum",
                  done: statusOf("curriculum") === "done",
                },
                { label: "first unit", done: statusOf("unit") === "done" },
                { label: "overview", done: statusOf("overview") === "done" },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2"
                >
                  <span
                    className={cn(row.done ? "text-white/80" : "text-white/35")}
                  >
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      "text-[11px]",
                      row.done ? "text-white/50" : "text-amber-300/70",
                    )}
                  >
                    {row.done ? "saved" : "didn't finish"}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-[13px] leading-6 text-white/50">
              Nothing was lost — resuming starts from the first unfinished step,
              and re-saves the finished ones for free.
            </p>
          </>
        ) : null}

        {isComplete || isError ? (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {isError && onRetry ? (
              <Button
                type="button"
                size="sm"
                disabled={preview || retryDisabled}
                onClick={onRetry}
                className="bg-white text-black hover:bg-white/90"
              >
                <ArrowClockwise size={13} weight="bold" aria-hidden="true" />
                Resume
              </Button>
            ) : null}

            {canStart ? (
              <Button
                type="button"
                size="sm"
                variant={isError ? "ghost" : "default"}
                disabled={preview || startPending}
                onClick={onStartLearning}
                className={cn(
                  isError
                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                    : "bg-white text-black hover:bg-white/90",
                )}
              >
                {startPending
                  ? "Preparing first unit"
                  : isError
                    ? "Start learning anyway"
                    : "Start learning"}
                <ArrowRight size={14} weight="bold" className="ml-1" />
              </Button>
            ) : null}

            {isComplete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  preview ||
                  !state.sessionId ||
                  overviewMissing ||
                  overviewGenerating
                }
                onClick={onSeeOverview}
                className="text-white/70 hover:bg-white/10 hover:text-white"
              >
                See overview
              </Button>
            ) : null}

            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[13px] text-white/40 hover:text-white/70"
            >
              Back to chat
            </button>
          </div>
        ) : null}

        {isError && state.error ? (
          <p className="mt-6 font-mono text-[11px] leading-5 text-white/30">
            {state.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
