"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { createPortal } from "react-dom";

/** Marks a DOM subtree whose text can be sent to the coach via selection. */
export const ASK_COACH_SOURCE_ATTRIBUTE = "data-ask-coach-source";

const SOURCE_SELECTOR = `[${ASK_COACH_SOURCE_ATTRIBUTE}]`;
const VIEWPORT_MARGIN = 12;

interface SelectionTooltipState {
  text: string;
  left: number;
  top: number;
}

const isWithinSource = (node: Node | null) => {
  if (!node) return false;
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(SOURCE_SELECTOR) != null;
};

const readSelectionTooltip = (): SelectionTooltipState | null => {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) return null;

  const range = selection.getRangeAt(0);
  if (
    !isWithinSource(range.startContainer) ||
    !isWithinSource(range.endContainer)
  ) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    text,
    left: Math.min(
      Math.max(rect.left + rect.width / 2, VIEWPORT_MARGIN),
      window.innerWidth - VIEWPORT_MARGIN,
    ),
    top: Math.max(rect.top, VIEWPORT_MARGIN),
  };
};

/**
 * Floating "Explain this" tooltip that appears above any text selection made
 * inside an [data-ask-coach-source] subtree. Selecting text and pressing the
 * tooltip hands the selected excerpt to `onAsk`.
 */
export function SelectionAskCoach({
  onAsk,
}: {
  onAsk: (text: string) => void;
}) {
  const [tooltip, setTooltip] = useState<SelectionTooltipState | null>(null);

  useEffect(() => {
    let frameId: number | null = null;

    const scheduleUpdate = () => {
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setTooltip(readSelectionTooltip());
      });
    };

    // The tooltip appears once the pointer/keyboard gesture ends, not while a
    // drag is still extending the selection under the cursor.
    const handleSelectionSettled = () => scheduleUpdate();
    // Mid-gesture we only react to the selection emptying so the tooltip
    // disappears immediately when the user clicks elsewhere.
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) setTooltip(null);
    };

    document.addEventListener("pointerup", handleSelectionSettled);
    document.addEventListener("keyup", handleSelectionSettled);
    document.addEventListener("selectionchange", handleSelectionChange);
    // Capture-phase scroll keeps the tooltip pinned to the (viewport-relative)
    // selection rect while any ancestor scroll container moves.
    window.addEventListener("scroll", scheduleUpdate, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      document.removeEventListener("pointerup", handleSelectionSettled);
      document.removeEventListener("keyup", handleSelectionSettled);
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("scroll", scheduleUpdate, { capture: true });
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  const handleAsk = useCallback(() => {
    if (!tooltip) return;
    onAsk(tooltip.text);
    document.getSelection()?.removeAllRanges();
    setTooltip(null);
  }, [onAsk, tooltip]);

  if (!tooltip) return null;

  return createPortal(
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)]"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      <button
        type="button"
        // pointerdown (not click) so the browser never collapses the selection
        // before we read it.
        onPointerDown={(event) => {
          event.preventDefault();
          handleAsk();
        }}
        className="border-foreground/[0.14] bg-popover text-foreground/85 hover:text-foreground hover:bg-muted animate-in fade-in zoom-in-95 inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2.5 text-[12px] font-medium whitespace-nowrap shadow-[0_6px_16px_rgba(0,0,0,0.28)] transition-colors duration-150 outline-none focus:outline-none"
      >
        <Sparkle size={13} weight="fill" className="text-foreground/55" />
        Explain this
      </button>
    </div>,
    document.body,
  );
}
