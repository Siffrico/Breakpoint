"use client";

import { memo } from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, SidebarSimple } from "@phosphor-icons/react";

import { Button } from "@acme/ui/button";

import type { AiWorkspace, WorkspaceMode } from "./use-workspace-session";
import { AssistantRichText } from "./assistant-rich-text";
import { WorkspaceHeaderTimer } from "./workspace-header-timer";

type EvaluationPlan = NonNullable<AiWorkspace["evaluationPlan"]>;

const ACTION_CLASS =
  "relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-[9px] border border-[var(--bp-toolbar-border)] bg-[var(--bp-toolbar-surface)] bg-clip-padding px-3 text-sm font-medium text-foreground shadow-[var(--bp-toolbar-shadow)] outline-none transition-colors hover:bg-[var(--bp-toolbar-surface-hover)] focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='opacity-'])]:opacity-85 [&_svg:not([class*='text-'])]:text-foreground/70";

interface WorkspaceHeaderProps {
  mode: WorkspaceMode;
  title: string;
  sidebarCollapsed: boolean;
  isSessionRunning: boolean;
  onboardingTurnCount: number;
  manualSetupHref: string | null;
  runningEvaluationPlan: EvaluationPlan | null;
  attemptStartedAt: number | null;
  hasLiveUnit: boolean;
  canAdvanceUnit: boolean;
  advancePending: boolean;
  preview: boolean;
  nextUnitTitle?: string;
  onOpenMobileSidebar: () => void;
  onToggleSidebar: () => void;
  onExitOnboarding: () => void;
  onToggleCoach: () => void;
  onAdvanceUnit: () => void;
}

function WorkspaceHeaderComponent({
  mode,
  title,
  sidebarCollapsed,
  isSessionRunning,
  onboardingTurnCount,
  manualSetupHref,
  runningEvaluationPlan,
  attemptStartedAt,
  hasLiveUnit,
  canAdvanceUnit,
  advancePending,
  preview,
  nextUnitTitle,
  onOpenMobileSidebar,
  onToggleSidebar,
  onExitOnboarding,
  onToggleCoach,
  onAdvanceUnit,
}: WorkspaceHeaderProps) {
  return (
    <header className="border-foreground/[0.08] relative flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open sidebar"
          className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors outline-none focus:outline-none focus-visible:outline-none md:hidden"
        >
          <SidebarSimple size={15} />
        </button>
        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Open sidebar"
            className="text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.04] -ml-1.5 hidden size-7 shrink-0 items-center justify-center rounded-[6px] transition-colors outline-none focus:outline-none focus-visible:outline-none md:flex"
          >
            <SidebarSimple size={15} />
          </button>
        ) : null}
        {mode === "onboarding" ? (
          <>
            <h1 className="font-display text-foreground/82 text-[14px] tracking-[-0.01em]">
              Defining your track
            </h1>
            <span aria-live="polite" className="text-foreground/40 text-[11px]">
              {isSessionRunning
                ? "Still calibrating..."
                : onboardingTurnCount > 0
                  ? `Question ${onboardingTurnCount + 1}`
                  : "Tell me who you want to become"}
            </span>
          </>
        ) : (
          <h1 className="font-display text-foreground min-w-0 text-[16px] tracking-[-0.02em]">
            <AssistantRichText
              content={title}
              className="overflow-hidden [&>*]:overflow-hidden [&>*]:text-ellipsis [&>*]:whitespace-nowrap"
            />
          </h1>
        )}
      </div>

      {runningEvaluationPlan && attemptStartedAt != null ? (
        <WorkspaceHeaderTimer
          plan={runningEvaluationPlan}
          attemptStartedAt={attemptStartedAt}
        />
      ) : null}

      {mode === "onboarding" && manualSetupHref ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onExitOnboarding}
            className="text-foreground/52 hover:text-foreground hover:bg-foreground/[0.04] h-7 rounded-none px-2 text-[12px] before:rounded-none"
          >
            Exit
          </Button>
          <Button
            render={<Link href={manualSetupHref} />}
            variant="outline"
            size="sm"
            className="border-foreground/12 bg-background text-foreground/72 hover:border-foreground/22 hover:bg-foreground/[0.04] hover:text-foreground h-7 rounded-none px-2.5 text-[12px] before:rounded-none"
          >
            Do manually
          </Button>
        </div>
      ) : mode === "unit" && hasLiveUnit ? (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleCoach}
            aria-label="Ask coach"
            className={ACTION_CLASS}
          >
            <Lightbulb weight="regular" />
            <span className="hidden sm:inline">Ask coach</span>
          </button>
          <button
            type="button"
            aria-label={advancePending ? "Advancing" : "Next Unit"}
            disabled={
              preview || isSessionRunning || !canAdvanceUnit || advancePending
            }
            onClick={onAdvanceUnit}
            title={
              canAdvanceUnit
                ? nextUnitTitle
                  ? `Continue to ${nextUnitTitle}`
                  : "Continue"
                : "Complete this unit to unlock"
            }
            className={ACTION_CLASS}
          >
            <span className="hidden sm:inline">
              {advancePending ? "Advancing..." : "Next Unit"}
            </span>
            <ArrowRight weight="regular" className="-ml-1" />
          </button>
        </div>
      ) : null}
    </header>
  );
}

export const WorkspaceHeader = memo(WorkspaceHeaderComponent);
