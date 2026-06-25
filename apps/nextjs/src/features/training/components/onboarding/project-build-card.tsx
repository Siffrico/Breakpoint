"use client";

import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  CaretDown,
  CheckCircle,
  Circle,
  Warning,
} from "@phosphor-icons/react";

import type {
  ProjectBuildState,
  ProjectBuildStep,
  ProjectBuildStepState,
} from "@acme/api/onboarding-chat";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";

const STATUS_LABELS: Record<ProjectBuildStepState["status"], string> = {
  pending: "Queued",
  active: "Running",
  done: "Done",
};

function StepStatusIcon({
  status,
}: {
  status: ProjectBuildStepState["status"];
}) {
  if (status === "done") {
    return (
      <CheckCircle
        size={15}
        weight="fill"
        className="text-foreground/75 shrink-0"
      />
    );
  }

  return <Circle size={15} className="text-foreground/30 shrink-0" />;
}

function StatusPill({ status }: { status: ProjectBuildStepState["status"] }) {
  return (
    <span
      className={cn(
        "rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase",
        status === "done" &&
          "border-foreground/15 bg-foreground/[0.04] text-foreground/65",
        status === "active" &&
          "border-primary/35 bg-primary/10 text-primary/90",
        status === "pending" &&
          "border-foreground/10 text-foreground/35 bg-transparent",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ProgressBar({
  progress,
  active,
}: {
  progress: number;
  active: boolean;
}) {
  return (
    <div className="bg-foreground/8 h-1.5 overflow-hidden rounded-[3px]">
      <div
        className={cn(
          "bg-primary h-full rounded-[3px] transition-[width] duration-500 ease-out",
          active && "shadow-[0_0_18px_rgba(59,130,246,0.24)]",
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function StepBody({
  step,
  state,
}: {
  step: ProjectBuildStepState;
  state: ProjectBuildState;
}) {
  const isActive = step.status === "active";
  const detail = step.detail;

  return (
    <div className="border-border/60 bg-background/35 mt-2 rounded-md border px-3 py-3">
      <div className="text-muted-foreground mb-2 flex items-center justify-between gap-3 font-mono text-[10px] tracking-wide uppercase">
        <span>{detail?.title ?? "Step detail"}</span>
        {isActive ? (
          <span className="text-primary/80">
            {detail?.generated ? "Receiving output" : "Awaiting stream"}
          </span>
        ) : null}
      </div>
      <pre className="text-foreground/68 max-h-40 font-mono text-[11px] leading-5 break-words whitespace-pre-wrap">
        {detail?.body ??
          "This section will populate when the build reaches it."}
      </pre>

      {step.id === "curriculum" && state.modules.length > 0 ? (
        <ul className="border-foreground/10 mt-3 flex flex-col gap-1 border-t pt-3">
          {state.modules.map((title, index) => (
            <li
              key={`${index}-${title}`}
              className="text-foreground/55 flex items-center gap-2 text-[12px] leading-5"
            >
              <span className="bg-primary/60 size-1 shrink-0 rounded-full" />
              {title}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Expandable project-build progress card. The backend streams a single keyed
 * project-build data part; this card renders the latest snapshot, plus live
 * artifact snippets when the agent runner emits partial structured output.
 */
export function ProjectBuildCard({
  state,
  preview = false,
  onStartLearning,
  onSeeOverview,
  onRetry,
  onRegenerateOverview,
}: {
  state: ProjectBuildState;
  preview?: boolean;
  onStartLearning: () => void;
  onSeeOverview: () => void;
  onRetry?: () => void;
  onRegenerateOverview?: () => void;
}) {
  const [expanded, setExpanded] = useState<
    Partial<Record<ProjectBuildStep, boolean>>
  >({});

  const { completeCount, progress, activeStep, activeHasOutput } =
    useMemo(() => {
      const complete = state.steps.filter(
        (step) => step.status === "done",
      ).length;
      const active = state.steps.find((step) => step.status === "active");
      const hasOutput = active?.detail?.generated === true;
      const activeWeight = active ? (hasOutput ? 0.7 : 0.35) : 0;
      const nextProgress =
        state.phase === "complete"
          ? 100
          : Math.min(
              98,
              ((complete + activeWeight) / state.steps.length) * 100,
            );

      return {
        completeCount: complete,
        progress: Math.round(nextProgress),
        activeStep: active,
        activeHasOutput: hasOutput,
      };
    }, [state]);

  const moduleLabel = state.moduleCount === 1 ? "module" : "modules";
  const overviewMissing = state.gaps?.includes("overview") ?? false;
  const isComplete = state.phase === "complete";
  const isError = state.phase === "error";

  return (
    <div
      className={cn(
        "border-border bg-card mt-2 w-full max-w-[68ch] rounded-lg border px-5 py-4",
        isComplete && "animate-in fade-in zoom-in-95 duration-500",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-muted-foreground flex items-center gap-2 font-mono text-[11px] tracking-wide uppercase">
            <span>createProject</span>
            {state.projectName ? (
              <span className="text-foreground/30 truncate">
                / {state.projectName}
              </span>
            ) : null}
          </div>
          <div className="text-foreground mt-1.5 text-base font-medium">
            {isComplete ? "Project ready" : "Building your project"}
          </div>
        </div>
        <div className="text-muted-foreground shrink-0 font-mono text-[11px]">
          {completeCount}/{state.steps.length}
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar progress={progress} active={!isComplete && !isError} />
        <div className="text-muted-foreground mt-2 flex items-center justify-between gap-3 text-[12px] leading-5">
          <span>
            {isComplete
              ? `${state.moduleCount} ${moduleLabel} ready`
              : activeStep
                ? `${activeStep.label} · ${
                    activeHasOutput
                      ? "agent output streaming"
                      : "waiting on model"
                  }`
                : "Preparing build"}
          </span>
          <span className="font-mono">{progress}%</span>
        </div>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {state.steps.map((step) => {
          const isExpanded = expanded[step.id] ?? step.status === "active";

          return (
            <li
              key={step.id}
              className={cn(
                "border-border/65 bg-background/20 rounded-md border px-3 py-2.5 transition-colors",
                step.status === "active" &&
                  "border-primary/25 bg-primary/[0.035]",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((current) => ({
                    ...current,
                    [step.id]: !(current[step.id] ?? step.status === "active"),
                  }))
                }
                className="flex w-full items-center gap-2 text-left outline-none"
                aria-expanded={isExpanded}
              >
                <CaretDown
                  size={14}
                  weight="bold"
                  className={cn(
                    "text-foreground/45 shrink-0 transition-transform duration-200",
                    !isExpanded && "-rotate-90",
                  )}
                />
                <StepStatusIcon status={step.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px] leading-6",
                    step.status === "done" && "text-foreground/78",
                    step.status === "active" && "text-foreground",
                    step.status === "pending" && "text-foreground/40",
                  )}
                >
                  {step.label}
                </span>
                <StatusPill status={step.status} />
              </button>

              {isExpanded ? <StepBody step={step} state={state} /> : null}
            </li>
          );
        })}
      </ol>

      {overviewMissing ? (
        <div className="border-border/60 bg-muted/35 text-muted-foreground mt-4 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13px]">
          <span className="flex items-center gap-2 leading-6">
            <Warning
              size={14}
              weight="fill"
              className="text-foreground/50 shrink-0"
            />
            Overview unavailable. The rest of your project is ready.
          </span>
          {onRegenerateOverview ? (
            <button
              type="button"
              onClick={onRegenerateOverview}
              disabled={preview}
              className="text-foreground/70 hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium disabled:opacity-50"
            >
              <ArrowClockwise size={11} weight="bold" />
              Regenerate
            </button>
          ) : null}
        </div>
      ) : null}

      {isError ? (
        <div className="border-destructive/30 bg-destructive/[0.06] text-destructive mt-4 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[13px]">
          <span className="leading-6">
            {state.error ?? "Something went wrong building your project."}
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="hover:text-destructive/80 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium"
            >
              <ArrowClockwise size={11} weight="bold" />
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {isComplete ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={preview || !state.sessionId}
            onClick={onStartLearning}
          >
            Start learning
            <ArrowRight size={14} weight="bold" className="ml-1" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={preview || !state.sessionId || overviewMissing}
            onClick={onSeeOverview}
          >
            See overview
          </Button>
        </div>
      ) : null}
    </div>
  );
}
