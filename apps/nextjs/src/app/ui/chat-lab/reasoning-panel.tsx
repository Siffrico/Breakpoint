"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@acme/ui";
import { StatusSpinner } from "@acme/ui/chat";

// Gradient-sweep text used by both reasoning variants. Inline styles (own
// keyframes, explicit text clipping) so it can't be broken by missing theme
// tokens or class conflicts on this token-less lab page.
function ShimmerText({ text }: { text: string }) {
  return (
    <>
      <style>{`
        @keyframes lab-reasoning-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
      `}</style>
      <span
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.4) 42%, #fff 50%, rgba(255,255,255,0.4) 58%)",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          animation: "lab-reasoning-shimmer 1.6s linear infinite",
        }}
      >
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

// Shimmer-only variant: no trace, just an animated status line (spinner +
// gradient sweep) while the model "thinks". It renders nothing once the answer
// starts — the reasoning simply gives way to the reply. Everything is inline
// and self-contained (own keyframes, inline text-clip styles) so it can't be
// broken by missing theme tokens or class conflicts.
export function ReasoningShimmer({
  reasoning,
  streaming,
  label = "Reasoning",
}: {
  reasoning: string;
  streaming: boolean;
  label?: string;
}) {
  if (reasoning.length === 0 || !streaming) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none mb-4 flex items-center gap-2 text-[14.7px] select-none"
    >
      <StatusSpinner />
      <ShimmerText text={label} />
    </div>
  );
}

// Auto-open / auto-close reasoning panel (AI Elements <Reasoning> pattern):
// opens by itself when reasoning starts streaming, shows the dimmed live trace,
// then collapses itself when the answer begins. After that it's a "Thought for
// Ns" disclosure the user can reopen. A manual toggle while streaming wins over
// the auto behavior until the next run.
export function ReasoningPanel({
  reasoning,
  streaming,
}: {
  reasoning: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(streaming);
  const [userToggled, setUserToggled] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track thinking duration while streaming.
  useEffect(() => {
    if (!streaming) return;
    startedAtRef.current ??= Date.now();
    const interval = setInterval(() => {
      if (startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [streaming]);

  // Auto-open on stream start, auto-collapse when the answer takes over —
  // unless the user has toggled it themselves this run.
  useEffect(() => {
    if (userToggled) return;
    setOpen(streaming);
  }, [streaming, userToggled]);

  // New run (reasoning reset) — clear the manual override and timer.
  useEffect(() => {
    if (reasoning.length === 0) {
      setUserToggled(false);
      startedAtRef.current = null;
      setElapsedMs(0);
    }
  }, [reasoning.length]);

  // Keep the live trace pinned to its newest line while streaming.
  useEffect(() => {
    if (!streaming || !open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [reasoning, streaming, open]);

  if (reasoning.length === 0) return null;

  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  const label = streaming ? "Reasoning" : `Thought for ${seconds}s`;

  return (
    <div className="mb-4">
      <button
        onClick={() => {
          setUserToggled(true);
          setOpen((v) => !v);
        }}
        className="flex items-center gap-2 text-[13px] text-white/45 transition-colors hover:text-white/70"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block text-[10px] transition-transform duration-200",
            open ? "rotate-90" : "rotate-0",
          )}
        >
          ▶
        </span>
        {streaming ? (
          <span className="select-none">
            <ShimmerText text={label} />
          </span>
        ) : (
          <span>{label}</span>
        )}
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div
            ref={scrollRef}
            className={cn(
              "mt-2 max-h-48 overflow-y-auto border-l border-white/12 pl-4 text-[13px] leading-6 text-white/45",
              streaming &&
                "[mask-image:linear-gradient(to_bottom,transparent,black_28px)]",
            )}
          >
            {reasoning.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i} className="my-2 first:mt-0 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
