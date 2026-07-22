"use client";

import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@acme/ui";

import { syncComposerHeight } from "./composer-autosize";

const LINE_HEIGHT_PX = 24;
const MAX_HEIGHT_PX = 220;

/**
 * Onboarding composer: a single-row pill. Controls sit inline with the text
 * rather than in a bottom row, so the resting state reads as "say one thing"
 * — the opposite of the workspace composer's drafting surface.
 *
 * The pill keeps its radius as it grows; the textarea is vertically centred
 * while it is one line tall and grows downward from there.
 */
export function OnboardingComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder = "Ask anything",
  disabled = false,
  textareaRef,
  className,
  style,
  leftSlot,
  rightSlot,
  autoFocus = false,
  ariaLabel = "Message",
}: {
  value: string;
  onValueChange: (next: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
  style?: CSSProperties;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? internalRef;

  useLayoutEffect(() => {
    syncComposerHeight(ref.current, LINE_HEIGHT_PX, MAX_HEIGHT_PX);
  }, [ref, value]);

  useEffect(() => {
    const handle = () =>
      syncComposerHeight(ref.current, LINE_HEIGHT_PX, MAX_HEIGHT_PX);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [ref]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, ref]);

  const propagateValue = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange(event.target.value);
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) onSubmit();
    }
  };

  return (
    <div
      // Default geometry follows the same concentric rule as the hero: a 36px
      // button inside 10px padding plus the 1px border gives a 58px pill, so
      // radius 29 makes the end caps exact semicircles centred on the buttons.
      style={{
        borderRadius: 29,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
        ...style,
      }}
      className={cn(
        "bg-background border-border relative flex w-full items-center gap-1.5 border p-2.5 transition-[border-color,box-shadow]",
        className,
      )}
    >
      {leftSlot ? (
        <div className="flex shrink-0 items-center gap-1 self-end">
          {leftSlot}
        </div>
      ) : null}

      <textarea
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        onChange={propagateValue}
        onKeyDown={submitOnEnter}
        placeholder={placeholder}
        rows={1}
        className="text-foreground placeholder:text-muted-foreground block min-w-0 flex-1 resize-none self-center bg-transparent px-1 text-[14px] leading-6 outline-none [&::-webkit-resizer]:hidden"
      />

      {rightSlot ? (
        <div className="flex shrink-0 items-center gap-1.5 self-end">
          {rightSlot}
        </div>
      ) : null}
    </div>
  );
}
