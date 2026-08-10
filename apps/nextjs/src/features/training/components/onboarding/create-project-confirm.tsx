"use client";

import { useMemo, useState } from "react";
import { ArrowRight, PencilSimple } from "@phosphor-icons/react";

import type { StartingPointTier } from "@acme/validators";
import { Button } from "@acme/ui/button";

/**
 * Client view of the `tool-createProject` UI part. The tool is loosely typed on
 * the message (the data parts carry the strong typing), so we narrow the few
 * fields we read here rather than threading the full tool generic.
 */
interface CreateProjectToolPart {
  type: "tool-createProject";
  state: string;
  input?: {
    projectName?: string;
    targetIdentity?: string;
    summary?: string;
    outcomes?: { title?: string; result?: string }[];
    understanding?: {
      build?: string;
      goodMeans?: string[];
      currentGap?: string;
    };
    startingPoint?: {
      tier?: StartingPointTier;
      reason?: string;
    };
  };
  approval?: {
    id: string;
    isAutomatic?: boolean;
    approved?: boolean;
  };
}

const TIER_CYCLE: StartingPointTier[] = [
  "fundamentals",
  "skip_basics",
  "advanced",
];

const TIER_DESCRIPTION: Record<StartingPointTier, string> = {
  fundamentals: "starting from the fundamentals",
  skip_basics: "skipping the basics",
  advanced: "straight to the hard stuff",
};

/**
 * The "Create project" card. Renders as soon as the tool input starts streaming
 * (outcomes appear one by one); the approve/deny buttons only mount once the
 * SDK holds the call for explicit human approval. Once approved, the build card
 * takes over; if declined, we acknowledge softly so the chat flows.
 */
export function CreateProjectConfirm({
  part,
  busy = false,
  onApprove,
  onDeny,
  onChangeStartingPoint,
}: {
  part: unknown;
  busy?: boolean;
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  /** Fires training.setStartingPoint when the learner overrides the tier. */
  onChangeStartingPoint?: (tier: StartingPointTier) => Promise<unknown>;
}) {
  const toolPart = part as CreateProjectToolPart;
  const approvalId = toolPart.approval?.id;

  // Local tier override so [change] updates the card instantly; the mutation
  // (via onChangeStartingPoint) reconciles the server in the background.
  const [tierOverride, setTierOverride] = useState<StartingPointTier | null>(
    null,
  );

  const denied =
    toolPart.state === "output-denied" ||
    (toolPart.state === "approval-responded" &&
      toolPart.approval?.approved === false);

  const approving =
    toolPart.state === "approval-requested" &&
    Boolean(approvalId) &&
    !toolPart.approval?.isAutomatic;

  const streaming =
    toolPart.state === "input-streaming" ||
    toolPart.state === "input-available";

  const proposedTier = toolPart.input?.startingPoint?.tier;
  const effectiveTier = tierOverride ?? proposedTier ?? null;
  const startingPointReason = useMemo(() => {
    // A manual override replaces the model's reason with the plain-language
    // description; otherwise keep the reason the model paraphrased.
    if (tierOverride) return TIER_DESCRIPTION[tierOverride];
    return toolPart.input?.startingPoint?.reason ?? null;
  }, [tierOverride, toolPart.input?.startingPoint?.reason]);

  if (denied) {
    return (
      <div className="text-muted-foreground mt-1 text-[13px] leading-6">
        No problem — let's keep refining.
      </div>
    );
  }

  // Nothing to show until the tool starts streaming (or is up for approval).
  if (!streaming && !approving) return null;

  const name = toolPart.input?.projectName ?? "your project";
  const summary = toolPart.input?.summary;
  const outcomes = toolPart.input?.outcomes ?? [];
  const understanding = toolPart.input?.understanding;
  const goodMeans = understanding?.goodMeans ?? [];

  const cycleTier = () => {
    if (!effectiveTier) return;
    const nextIndex =
      (TIER_CYCLE.indexOf(effectiveTier) + 1) % TIER_CYCLE.length;
    const next = TIER_CYCLE[nextIndex] ?? "fundamentals";
    const previousOverride = tierOverride;
    setTierOverride(next);
    void onChangeStartingPoint?.(next).catch(() => {
      setTierOverride(previousOverride);
    });
  };

  return (
    <div className="border-border bg-card animate-in fade-in slide-in-from-bottom-1 mt-2 w-full max-w-[68ch] rounded-2xl border px-5 py-4 duration-300">
      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
        Create project
      </div>
      <div className="text-foreground mt-1 text-base font-medium">{name}</div>
      {summary ? (
        <div className="text-muted-foreground mt-1 text-[13px] leading-6">
          {summary}
        </div>
      ) : null}

      {/* The consultant's reading of the learner. Approving this card is them
          agreeing it is right, so it sits above everything derived from it. */}
      {understanding?.build ? (
        <div className="mt-4">
          <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
            What I think you want
          </div>
          <div className="text-foreground/90 mt-1.5 text-[13px] leading-6">
            {understanding.build}
          </div>

          {goodMeans.length > 0 ? (
            <div className="text-muted-foreground mt-2 text-[13px] leading-6">
              Good means:{" "}
              <span className="text-foreground/90">{goodMeans.join(", ")}</span>
            </div>
          ) : null}

          {understanding.currentGap ? (
            <div className="text-muted-foreground mt-1 text-[13px] leading-6">
              Where you're stuck:{" "}
              <span className="text-foreground/90">
                {understanding.currentGap}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {outcomes.length > 0 ? (
        <div className="mt-4">
          <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Outcomes you'll reach
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {outcomes.map((outcome, index) => (
              <li
                key={`${outcome.title ?? "outcome"}-${index}`}
                className="text-foreground/90 animate-in fade-in text-[13px] leading-6 duration-300"
              >
                <span className="font-medium">{outcome.title}</span>
                {outcome.result ? ` — ${outcome.result}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {effectiveTier && startingPointReason ? (
        <div className="mt-4">
          <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Your starting point
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="text-foreground/90 text-[13px] leading-6">
              {startingPointReason}
            </div>
            {onChangeStartingPoint ? (
              <button
                type="button"
                onClick={cycleTier}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[12px] transition-colors disabled:opacity-50"
              >
                <PencilSimple size={12} weight="bold" />
                change
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {approving && approvalId ? (
        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onApprove(approvalId)}
          >
            Create project
            <ArrowRight size={14} weight="bold" className="ml-1" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDeny(approvalId)}
          >
            Not yet
          </Button>
        </div>
      ) : null}
    </div>
  );
}
