"use client";

import { ArrowRight } from "@phosphor-icons/react";

import type { ProjectBuildState } from "@acme/api/onboarding-chat";
import { Button } from "@acme/ui/button";

import { AiLoader } from "./ai-loader";

/** The build is a chat-scoped stream, so this is an overlay on the onboarding
 *  shell rather than a route — navigating away would unmount `useChat` and kill
 *  the stream mid-build. Deliberately bare: the orb is the whole status report,
 *  and the only thing the learner can act on is starting their first unit. */
export function ProjectBuildScreen({
  state,
  preview = false,
  onStartLearning,
  onRetry,
  startPending = false,
  retryDisabled = false,
}: {
  state: ProjectBuildState;
  preview?: boolean;
  onStartLearning: () => void;
  onRetry?: () => void;
  startPending?: boolean;
  retryDisabled?: boolean;
}) {
  const isComplete = state.phase === "complete";
  const isError = state.phase === "error";

  // The first unit is saved before the overview and finalize steps run, so the
  // learner can leave for it the moment there is something to open — they do
  // not wait on the tail of the build.
  const canStart = Boolean(state.sessionId && state.firstUnitId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-[#111111] px-6 py-16 text-white">
      <div className="flex flex-1 items-center justify-center">
        <AiLoader
          text={isError ? "Stopped" : isComplete ? "Ready" : "Generating"}
        />
      </div>

      {/* Action slot: sits between the orb and the footer note. Holds the start
          button once the first unit exists, or the error pill if the build died. */}
      <div className="flex min-h-9 w-full items-center justify-center">
        {isError ? (
          <div className="border-border/60 flex w-full max-w-[420px] items-center gap-3 rounded-lg border bg-white/[0.03] py-2 pr-2 pl-3.5">
            <span className="basis-3/5 truncate text-[13px] text-white/60">
              {state.error ?? "The build stopped early."}
            </span>
            {onRetry ? (
              <Button
                type="button"
                size="sm"
                disabled={preview || retryDisabled}
                onClick={onRetry}
                className="basis-2/5 border-[#2563eb] bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              >
                Resume
              </Button>
            ) : null}
          </div>
        ) : canStart ? (
          <Button
            type="button"
            disabled={preview || startPending}
            onClick={onStartLearning}
            className="animate-in fade-in slide-in-from-bottom-1 border-[#2563eb] bg-[#2563eb] text-white duration-500 hover:bg-[#1d4ed8]"
          >
            {startPending ? "Preparing first unit" : "Start"}
            <ArrowRight size={14} weight="bold" />
          </Button>
        ) : null}
      </div>

      <p className="mt-10 max-w-[44ch] text-center text-[13px] leading-6 text-white/40">
        Curriculum generation can take 5–10 minutes. You can switch tabs while
        you wait.
      </p>
    </div>
  );
}
