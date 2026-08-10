"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@acme/ui";

import { DotmTriangle1 } from "../dotm-triangle-1";

const TEXT_RENDER_PACE_MS = 24;
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/;

function StreamingAnimationStyles() {
  return (
    <style>{`
      @keyframes bp-text-shimmer {
        from { background-position: 200% 0; }
        to { background-position: -200% 0; }
      }
    `}</style>
  );
}

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
};

const getStep = (size: number) => {
  if (size <= 12) return 2;
  if (size <= 48) return 4;
  if (size <= 96) return 8;
  return Math.min(24, Math.ceil(size / 8));
};

const getNextBoundary = (text: string, start: number) => {
  const end = Math.min(text.length, start + getStep(text.length - start));
  const max = Math.min(text.length, end + 8);
  for (let index = end; index < max; index += 1) {
    if (TEXT_RENDER_SNAP.test(text[index] ?? "")) return index + 1;
  }
  return end;
};

export function PacedAssistantText({
  text,
  active,
  children,
}: {
  text: string;
  active: boolean;
  children: (visibleText: string) => ReactNode;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [visibleText, setVisibleText] = useState(text);
  const visibleRef = useRef(text);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPendingTimeout = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => {
    const sync = (value: string) => {
      visibleRef.current = value;
      setVisibleText(value);
    };

    if (!active || reducedMotion) {
      clearPendingTimeout();
      sync(text);
      return clearPendingTimeout;
    }

    if (
      !text.startsWith(visibleRef.current) ||
      text.length < visibleRef.current.length
    ) {
      clearPendingTimeout();
      sync(text);
      return clearPendingTimeout;
    }

    if (text.length === visibleRef.current.length || timeoutRef.current) {
      return clearPendingTimeout;
    }

    const run = () => {
      timeoutRef.current = null;
      if (!text.startsWith(visibleRef.current)) {
        sync(text);
        return;
      }
      const nextEnd = getNextBoundary(text, visibleRef.current.length);
      sync(text.slice(0, nextEnd));
      if (nextEnd < text.length) {
        timeoutRef.current = setTimeout(run, TEXT_RENDER_PACE_MS);
      }
    };

    timeoutRef.current = setTimeout(run, TEXT_RENDER_PACE_MS);
    return clearPendingTimeout;
  }, [active, clearPendingTimeout, reducedMotion, text]);

  useEffect(() => clearPendingTimeout, [clearPendingTimeout]);

  return children(visibleText);
}

export function TextShimmer({
  text,
  active = true,
  className,
}: {
  text: string;
  active?: boolean;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  // Inline text-clipping (not Tailwind classes) so the gradient is guaranteed
  // to paint inside the glyphs. `-webkit-text-fill-color` hides the base fill
  // while leaving the `color` property intact, so `currentColor` in the
  // gradient still resolves to the surrounding theme color.
  return (
    <span
      className={cn(
        "select-none whitespace-pre align-baseline font-[inherit] leading-[inherit]",
        className,
      )}
      aria-label={text}
    >
      <StreamingAnimationStyles />
      {active && !reducedMotion ? (
        <span
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(90deg, color-mix(in srgb, currentColor 45%, transparent) 42%, currentColor 50%, color-mix(in srgb, currentColor 45%, transparent) 58%)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "bp-text-shimmer 1.6s linear infinite",
          }}
        >
          {text}
        </span>
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </span>
  );
}

export function TextReveal({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [current, setCurrent] = useState(text);
  const [previous, setPrevious] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [width, setWidth] = useState<number | null>(null);
  const incomingRef = useRef<HTMLSpanElement>(null);
  const outgoingRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (text === current) return;

    const updateTimeout = window.setTimeout(() => {
      setPrevious(current);
      setCurrent(text);
      setSwapping(!reducedMotion);

      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        const incomingWidth = incomingRef.current?.scrollWidth ?? 0;
        const outgoingWidth = outgoingRef.current?.scrollWidth ?? 0;
        setWidth((currentWidth) =>
          Math.max(currentWidth ?? 0, incomingWidth, outgoingWidth),
        );
        setSwapping(false);
        frameRef.current = null;
      });
    }, 0);

    const timeout = window.setTimeout(() => setPrevious(null), 480);
    return () => {
      window.clearTimeout(updateTimeout);
      window.clearTimeout(timeout);
    };
  }, [current, reducedMotion, text]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return (
    <span
      className={cn("inline-flex min-w-0 items-center", className)}
      aria-label={text}
    >
      <span
        className="grid min-h-[1.25em] items-center overflow-visible transition-[width] duration-[450ms] ease-out motion-reduce:transition-none"
        style={{ width: width == null ? "auto" : `${width}px` }}
      >
        <span
          ref={incomingRef}
          aria-hidden="true"
          className={cn(
            "col-start-1 row-start-1 whitespace-nowrap transition-[mask-position,transform] duration-[450ms] ease-out [mask-image:linear-gradient(to_top,white_33%,transparent_50%)] [mask-position:0_100%] [mask-size:100%_300%] motion-reduce:transition-none",
            swapping && "-translate-y-1 [mask-position:0_0%]",
          )}
        >
          {current.length > 0 ? current : "\u00A0"}
        </span>
        <span
          ref={outgoingRef}
          aria-hidden="true"
          className={cn(
            "col-start-1 row-start-1 whitespace-nowrap transition-[mask-position,transform] duration-[450ms] ease-out [mask-image:linear-gradient(to_bottom,white_33%,transparent_50%)] [mask-position:0_100%] [mask-size:100%_300%] motion-reduce:hidden",
            swapping ? "translate-y-0 [mask-position:0_0%]" : "translate-y-1",
            previous == null && "hidden",
          )}
        >
          {previous == null || previous.length === 0 ? "\u00A0" : previous}
        </span>
      </span>
    </span>
  );
}

export function WorkspaceStatusLine({
  label,
  active = true,
  className,
}: {
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "text-foreground/42 flex select-none items-center gap-2.5 text-[14.7px] tracking-[-0.01em]",
        className,
      )}
    >
      <StreamingAnimationStyles />
      <StatusSpinner />
      <span className="min-w-0">
        {active ? (
          <TextShimmer text={label} className="max-w-full" />
        ) : (
          <TextReveal text={label} className="max-w-full" />
        )}
      </span>
      <span className="sr-only">{active ? label : "Complete"}</span>
    </div>
  );
}

export function StatusSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-3.5 shrink-0 -translate-y-px items-center justify-center"
    >
      <DotmTriangle1 size={14} dotSize={1} />
    </span>
  );
}
