"use client";

import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  Circle,
  CircleNotch,
  Warning,
} from "@phosphor-icons/react";

import type {
  ProjectBuildState,
  ProjectBuildStepState,
} from "@acme/api/onboarding-chat";
import { Button } from "@acme/ui/button";
import { TextShimmer } from "@acme/ui/chat";

function StepGlyph({ status }: { status: ProjectBuildStepState["status"] }) {
  if (status === "done") {
    return (
      <CheckCircle
        size={16}
        weight="fill"
        className="text-foreground/80 shrink-0"
      />
    );
  }
  if (status === "active") {
    return (
      <CircleNotch
        size={16}
        weight="bold"
        className="text-foreground/70 shrink-0 animate-spin motion-reduce:animate-none"
      />
    );
  }
  return <Circle size={16} className="text-foreground/25 shrink-0" />;
}

/**
 * The build "todo list" and its resolved handoff. Driven entirely by the
 * streamed `data-project-build` part — each step is one server-side agent
 * ticking off, then on completion the card becomes the Start learning / See
 * overview gateway into the freshly-built project.
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
  if (state.phase === "complete") {
    const moduleLabel = state.moduleCount === 1 ? "module" : "modules";
    const overviewMissing = state.gaps?.includes("overview") ?? false;
    return (
      <div className="border-border bg-card animate-in fade-in zoom-in-95 mt-2 w-full max-w-[68ch] rounded-2xl border px-5 py-5 duration-500">
        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] tracking-wide uppercase">
          <CheckCircle size={13} weight="fill" className="text-foreground/70" />
          Project ready
        </div>
        <div className="text-foreground mt-1.5 text-base font-medium">
          {state.projectName}
        </div>
        <div className="text-muted-foreground mt-1 text-[13px] leading-6">
          {state.moduleCount} {moduleLabel}
          {state.targetIdentity ? (
            <>
              {" "}
              toward{" "}
              <span className="text-foreground/75">{state.targetIdentity}</span>
            </>
          ) : null}
        </div>
        {overviewMissing ? (
          <div className="border-border/60 bg-muted/40 text-muted-foreground mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2 leading-6">
              <Warning
                size={14}
                weight="fill"
                className="text-foreground/50 shrink-0"
              />
              Overview unavailable — the rest of your project is ready.
            </span>
            {onRegenerateOverview ? (
              <button
                type="button"
                onClick={onRegenerateOverview}
                disabled={preview}
                className="hover:bg-foreground/5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium disabled:opacity-50"
              >
                <ArrowClockwise size={11} weight="bold" />
                Regenerate
              </button>
            ) : null}
          </div>
        ) : null}
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
      </div>
    );
  }

  return (
    <div className="border-border bg-card mt-2 w-full max-w-[68ch] rounded-2xl border px-5 py-4">
      <div className="text-muted-foreground mb-3 flex items-center gap-2 font-mono text-[11px] tracking-wide uppercase">
        <span>createProject</span>
        {state.projectName ? (
          <span className="text-foreground/30">· {state.projectName}</span>
        ) : null}
      </div>

      <ol className="flex flex-col gap-2">
        {state.steps.map((step) => (
          <li key={step.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5 text-[14px] leading-6">
              <StepGlyph status={step.status} />
              {step.status === "active" ? (
                <TextShimmer text={step.label} className="text-foreground/90" />
              ) : (
                <span
                  className={
                    step.status === "done"
                      ? "text-foreground/80"
                      : "text-foreground/40"
                  }
                >
                  {step.label}
                </span>
              )}
            </div>

            {/* Module titles stream in under "Designing your curriculum" the
                moment the curriculum agent returns. */}
            {step.id === "curriculum" && state.modules.length > 0 ? (
              <ul className="border-foreground/10 ml-[7px] flex flex-col gap-1 border-l pt-1 pl-4">
                {state.modules.map((title, index) => (
                  <li
                    key={`${index}-${title}`}
                    className="text-foreground/55 animate-in fade-in slide-in-from-left-1 flex items-center gap-2 text-[13px] leading-6 duration-300"
                    style={{
                      animationDelay: `${Math.min(index * 60, 600)}ms`,
                      animationFillMode: "backwards",
                    }}
                  >
                    <span className="bg-foreground/30 size-1 shrink-0 rounded-full" />
                    {title}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      {state.phase === "error" ? (
        <div className="border-destructive/30 bg-destructive/[0.06] text-destructive mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px]">
          <span className="leading-6">
            {state.error ?? "Something went wrong building your project."}
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="hover:bg-destructive/10 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium"
            >
              <ArrowClockwise size={11} weight="bold" />
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
