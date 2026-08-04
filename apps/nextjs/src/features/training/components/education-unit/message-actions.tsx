"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ChatCircle,
  Check,
  Copy,
} from "@phosphor-icons/react";

import { toast } from "@acme/ui/toast";

const COPIED_RESET_MS = 2000;

/**
 * Per-message actions, revealed on hover.
 *
 * Visibility is CSS only — the row is always mounted at `opacity-0` and the
 * enclosing message carries the `group` class, so a mouse crossing the trail
 * triggers no React state and no re-render. `min-h-6` keeps the row's space
 * reserved while hidden, so revealing it can never reflow the message above.
 * `group-focus-within` is what makes the row reachable by keyboard, since a
 * tab into a hidden button would otherwise leave the focus ring invisible.
 */
export function MessageActions({
  align,
  text,
  onEdit,
  editDisabled = false,
  onAskCoach,
}: {
  align: "start" | "end";
  text: string;
  onEdit?: () => void;
  editDisabled?: boolean;
  onAskCoach?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimeoutRef.current != null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, COPIED_RESET_MS);
    } catch {
      toast.error("Message could not be copied.");
    }
  };

  return (
    <div
      className={[
        "pointer-events-none mt-1 flex min-h-6 items-center gap-2.5 opacity-0 transition-opacity duration-150 will-change-[opacity]",
        "group-hover:pointer-events-auto group-hover:opacity-100",
        "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        align === "end" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {onEdit ? (
        <ActionButton
          label="Revise this answer"
          disabled={editDisabled}
          onClick={onEdit}
        >
          <ArrowCounterClockwise size={14} />
        </ActionButton>
      ) : null}
      <ActionButton
        label={copied ? "Copied" : "Copy"}
        onClick={() => void copyMessage()}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </ActionButton>
      {onAskCoach ? (
        <ActionButton label="Ask coach about this" onClick={onAskCoach}>
          <ChatCircle size={14} />
        </ActionButton>
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground disabled:text-foreground/20 inline-flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors disabled:bg-transparent"
    >
      {children}
    </button>
  );
}
