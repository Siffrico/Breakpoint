"use client";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type ClusterBriefing = NonNullable<
  RouterOutputs["becoming"]["unit"]["clusterBriefing"]
>;

export function ClusterBriefingCard({
  briefing,
  expanded,
  onToggle,
}: {
  briefing: ClusterBriefing;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="border-b border-border/50 pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 bg-primary" />
            <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Sequence Briefing
            </span>
          </div>
          <p className="max-w-3xl text-sm leading-7 text-foreground/72">
            A short map of how this sequence fits together before you step into the
            unit.
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-auto px-0 text-xs tracking-[0.18em] uppercase text-primary/80 hover:bg-transparent hover:text-primary"
        >
          {expanded ? "Hide map" : "Show map"}
        </Button>
      </div>

      {expanded ? (
        <div className="mt-5 grid gap-5 border-t border-border/80 pt-5 md:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <p className="text-sm leading-7 text-foreground/78">
            {briefing.briefingArc}
          </p>

          <div className="space-y-3 border border-border/80 bg-background/40 p-4">
            {briefing.briefingMap.map((item) => (
              <div key={item.position} className="space-y-1">
                <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
                  Slot {item.position}
                </p>
                <p className="text-sm leading-6 text-foreground/74">{item.role}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
