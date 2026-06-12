"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@acme/ui";

const TEXT_RENDER_PACE_MS = 24;
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/;

function StreamingAnimationStyles() {
  return (
    <style>{`
      @keyframes bp-text-shimmer {
        0% { background-position: 100% 0, 0 0; }
        100% { background-position: 0% 0, 0 0; }
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
  return (
    <span
      className={cn(
        "relative inline-grid whitespace-pre align-baseline font-[inherit] leading-[inherit]",
        className,
      )}
      aria-label={text}
    >
      <StreamingAnimationStyles />
      <span
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 transition-opacity duration-200",
          active ? "opacity-0 motion-reduce:opacity-100" : "opacity-100",
        )}
      >
        {text}
      </span>
      <span
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 30%, currentColor 50%, transparent 70%), linear-gradient(currentColor, currentColor)",
          backgroundSize: "360% 100%, 100% 100%",
        }}
        className={cn(
          "col-start-1 row-start-1 bg-clip-text text-transparent transition-opacity duration-200 [-webkit-text-fill-color:transparent] motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-current motion-reduce:[-webkit-text-fill-color:currentColor]",
          active
            ? "animate-[bp-text-shimmer_1.2s_linear_infinite] opacity-100"
            : "opacity-0",
        )}
      >
        {text}
      </span>
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
        "text-foreground/42 flex items-center gap-3 text-[14px] tracking-[-0.01em]",
        className,
      )}
    >
      <StreamingAnimationStyles />
      <span
        aria-hidden="true"
        className="border-foreground/18 border-t-foreground/55 size-4 animate-spin rounded-full border motion-reduce:animate-pulse"
      />
      <span className="relative min-w-0">
        <TextReveal
          text={label}
          className={cn(
            "max-w-full",
            active && "opacity-0 motion-reduce:opacity-100",
          )}
        />
        {active ? (
          <TextShimmer
            text={label}
            className="absolute inset-y-0 left-0 max-w-full motion-reduce:hidden"
          />
        ) : null}
      </span>
      <span className="sr-only">{active ? label : "Complete"}</span>
    </div>
  );
}
