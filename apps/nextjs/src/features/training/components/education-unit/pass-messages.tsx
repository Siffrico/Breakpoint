"use client";

import { WorkspaceStatusLine } from "@acme/ui/chat";

import { AssistantRichText } from "../assistant-rich-text";
import { MessageActions } from "./message-actions";
import { ASK_COACH_SOURCE_ATTRIBUTE } from "./selection-ask-coach";

export const CHAT_COLUMN_CLASS =
  "mx-auto w-[calc(100%-2rem)] max-w-[48.9rem] sm:w-[calc(100%-3rem)]";

export function PromptTurn({
  prompt,
  helper,
  difficultyDirectiveReason = null,
  statusLabel = null,
  copyable = true,
  streaming = false,
}: {
  prompt: string;
  helper?: string | null;
  difficultyDirectiveReason?: string | null;
  statusLabel?: string | null;
  /** True while this turn's text is still arriving, so words reveal as they land. */
  streaming?: boolean;
  /** False for the notice turns (unavailable, resume-blocked) — those are UI
      copy, not something the learner would ever want on their clipboard. */
  copyable?: boolean;
}) {
  return (
    <section className="py-[13px] font-sans">
      {/* Assistant content fills the column edge-to-edge (no extra px); the
          learner's receipt answers it from the right. `group` scopes the
          hover that reveals this turn's actions. */}
      <div
        className={`${CHAT_COLUMN_CLASS} group`}
        {...{ [ASK_COACH_SOURCE_ATTRIBUTE]: "" }}
      >
        {statusLabel ? (
          <WorkspaceStatusLine
            label={statusLabel}
            className={prompt.trim() ? "mb-4" : undefined}
          />
        ) : null}
        {difficultyDirectiveReason ? (
          <div className="border-foreground/[0.10] bg-foreground/[0.035] text-foreground/52 mb-3 inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] leading-4">
            <span className="truncate">{difficultyDirectiveReason}</span>
          </div>
        ) : null}
        {prompt.trim() ? (
          // Live turns are smoothed server-side by smoothStream, so render the
          // streamed text straight — no client-side pacing needed. The focus
          // reveal is CSS-only on top of whatever cadence the server sends.
          <AssistantRichText
            content={prompt}
            streaming={streaming}
            className="text-foreground/94 [&_h2]:!text-foreground/52 [&_hr]:border-foreground/10 text-[15px] leading-7 [&_h1]:!mt-0 [&_h1]:!mb-3 [&_h1]:!text-[24px] [&_h1]:!leading-8 [&_h1]:!font-semibold [&_h1]:!tracking-[-0.025em] [&_h2]:!mt-7 [&_h2]:!mb-2 [&_h2]:!text-[13px] [&_h2]:!font-medium [&_h2]:!tracking-[0.08em] [&_h3]:!mt-6 [&_h3]:!mb-2 [&_h3]:!text-[17px] [&_h3]:!font-semibold [&_hr]:my-6 [&_li]:my-1 [&_li]:leading-7 [&_ol]:!my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:!my-3 [&_strong]:font-semibold [&_ul]:!my-3 [&_ul]:list-disc [&_ul]:pl-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />
        ) : null}
        {helper ? (
          <AssistantRichText
            content={helper}
            className="text-foreground/48 mt-3 text-[13px] leading-6 [&_em]:not-italic"
          />
        ) : null}
        {copyable && prompt.trim() ? (
          <MessageActions align="start" text={prompt} />
        ) : null}
      </div>
    </section>
  );
}

export function SubmittedAnswerReceipt({
  text,
  pending = false,
  failed = false,
  canRevise,
  onRevise,
  onRetry,
  onAskCoach,
}: {
  text: string;
  pending?: boolean;
  failed?: boolean;
  canRevise: boolean;
  onRevise: () => void;
  onRetry?: () => void;
  onAskCoach?: () => void;
}) {
  return (
    <section className="py-[13px] font-sans">
      <div className={CHAT_COLUMN_CLASS}>
        {/* The learner's turn as a right-aligned chat message. The block is
            shrink-to-fit and pushed right by ml-auto, so its right edge lands
            on the column's right edge — the same edge as the composer — while
            a short answer keeps a short bubble. `group` scopes the hover that
            reveals this message's actions. */}
        <div className="group ml-auto w-fit max-w-[65%] min-w-[min(17rem,100%)]">
          {/* No caption: the bubble's position already says whose turn this is.
              The row carries transient send state only — and Retry stays
              outside the hover row, because a send that failed must be
              recoverable without first discovering that hover reveals things. */}
          {pending || failed ? (
            <div className="mb-1.5 flex items-center gap-2 text-[12px]">
              {pending ? (
                <span className="text-foreground/38">Submitting...</span>
              ) : null}
              {failed ? (
                <span className="text-destructive/80">Failed to send</span>
              ) : null}
              {failed && onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-destructive/80 hover:bg-destructive/[0.08] hover:text-destructive rounded-sm px-1.5 py-0.5 transition-colors"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="border-border bg-card rounded-lg border px-4 py-3">
            <p className="text-foreground/88 text-[14px] leading-6 whitespace-pre-wrap">
              {text}
            </p>
          </div>

          <MessageActions
            align="end"
            text={text}
            onEdit={onRevise}
            editDisabled={!canRevise}
            onAskCoach={onAskCoach}
          />
        </div>
      </div>
    </section>
  );
}
