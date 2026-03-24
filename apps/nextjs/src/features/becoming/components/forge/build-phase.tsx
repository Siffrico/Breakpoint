"use client";

import { Button } from "@acme/ui/button";

export function BuildPhase({
  buildContent,
  onComplete,
}: {
  buildContent: string;
  onComplete: () => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="border border-border bg-card p-6 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 bg-primary" />
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Build
          </span>
        </div>

        <p className="mt-5 whitespace-pre-wrap text-[15px] leading-8 text-foreground/78">
          {buildContent}
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onComplete}
          className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
        >
          Continue to Practice
        </Button>
      </div>
    </section>
  );
}
