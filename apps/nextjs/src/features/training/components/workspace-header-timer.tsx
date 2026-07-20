"use client";

import { useEffect, useState } from "react";

import type { RouterOutputs } from "@acme/api";

type AiWorkspace = Extract<
  RouterOutputs["training"]["aiWorkspace"],
  { kind: "ready" }
>["workspace"];
type EvaluationPlan = NonNullable<AiWorkspace["evaluationPlan"]>;

const formatTimerSeconds = (seconds: number) => {
  const sign = seconds < 0 ? "-" : "";
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute % 60;

  return `${sign}${minutes}:${remainder.toString().padStart(2, "0")}`;
};

/**
 * Owns the 250ms countdown tick in isolation. A timer tick must re-render only
 * this readout, never the workspace shell or the transcript beneath it — which
 * is why the interval state lives here instead of in WorkspaceShell. The parent
 * mounts this only while a timed evaluation is running, so the `now` clock is
 * fresh at activation and no synchronous priming set is needed.
 */
export function WorkspaceHeaderTimer({
  plan,
  attemptStartedAt,
}: {
  plan: EvaluationPlan;
  attemptStartedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, []);

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - attemptStartedAt) / 1000),
  );
  const remainingSeconds = plan.timeLimitSeconds - elapsedSeconds;

  return (
    <div
      className="text-foreground/76 absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[13px] tabular-nums"
      title="Continuous timer: leaving or reloading does not pause it."
    >
      <span aria-live="polite">{formatTimerSeconds(remainingSeconds)}</span>
      <span className="text-foreground/38 font-sans text-[10px] tracking-wide uppercase">
        No pause
      </span>
    </div>
  );
}
