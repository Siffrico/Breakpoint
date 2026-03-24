"use client";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";

import type { ForgeDebrief } from "~/features/becoming/lib/forge-preview";

export function UnitDebrief({
  debrief,
  onContinue,
}: {
  debrief: ForgeDebrief;
  onContinue: () => void;
}) {
  return (
    <section className="flex flex-col gap-0">
      {/* Score + readiness header */}
      <div className="border border-border bg-card p-6 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Unit complete
            </span>
            <div className="font-display mt-2 text-5xl tracking-[-0.06em] text-foreground">
              {debrief.score}
            </div>
          </div>
          <span
            className={cn(
              "border px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] uppercase",
              debrief.readiness === "ready_for_next_unit" &&
                "border-primary/20 bg-primary/8 text-primary",
              debrief.readiness === "developing" &&
                "border-border bg-secondary text-muted-foreground",
              debrief.readiness === "needs_repair" &&
                "border-destructive/20 bg-destructive/5 text-destructive/70",
            )}
          >
            {debrief.readiness.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      {/* Before vs After — the growth moment */}
      <div className="grid gap-0 lg:grid-cols-2 -mt-px">
        <div className="border border-border bg-secondary/30 p-6">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/60">
            Before — your seed
          </span>
          <p className="mt-3 text-sm leading-7 text-foreground/50 italic">
            "{debrief.seedResponse}"
          </p>
        </div>
        <div className="border border-border bg-card p-6 -ml-px max-lg:-mt-px max-lg:ml-0">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-primary/70">
            After — your articulation
          </span>
          <p className="mt-3 text-sm leading-7 text-foreground/75">
            "{debrief.finalArticulation}"
          </p>
        </div>
      </div>

      {/* Growth dimensions */}
      <div className="border border-border bg-card p-6 -mt-px">
        <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-primary/70">
          Growth dimensions
        </span>
        <div className="mt-4 flex flex-col gap-3">
          {debrief.growthDimensions.map((dimension) => (
            <div
              key={dimension}
              className="flex items-start gap-3 text-sm leading-7 text-foreground/70"
            >
              <div className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-primary/50" />
              {dimension}
            </div>
          ))}
        </div>
      </div>

      {/* Strengths + Improvements + Failure tags */}
      <div className="grid gap-0 lg:grid-cols-3 -mt-px">
        <div className="border border-border bg-card p-5">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Strengths
          </span>
          <div className="mt-3 flex flex-col gap-3">
            {debrief.strengths.map((item) => (
              <p key={item} className="text-sm leading-7 text-foreground/65">
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="border border-border bg-card p-5 -ml-px max-lg:-mt-px max-lg:ml-0">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Improvements
          </span>
          <div className="mt-3 flex flex-col gap-3">
            {debrief.improvements.map((item) => (
              <p key={item} className="text-sm leading-7 text-foreground/65">
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="border border-border bg-card p-5 -ml-px max-lg:-mt-px max-lg:ml-0">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Failure tags
          </span>
          <div className="mt-3 flex flex-wrap gap-2">
            {debrief.failureTags.map((tag) => (
              <span
                key={tag}
                className="border border-destructive/15 bg-destructive/5 px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] uppercase text-destructive/60"
              >
                {tag.replaceAll("-", " ")}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-7 text-foreground/55">
            {debrief.nextStep}
          </p>
        </div>
      </div>

      {/* Continue */}
      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          onClick={onContinue}
          className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
        >
          {debrief.readiness === "ready_for_next_unit"
            ? "Next unit"
            : "Return to workspace"}
        </Button>
      </div>
    </section>
  );
}
