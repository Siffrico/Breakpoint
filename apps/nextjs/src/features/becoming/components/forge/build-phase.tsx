"use client";

import { parseBuildContentSections } from "@acme/validators";
import { Button } from "@acme/ui/button";

export function BuildPhase({
  buildContent,
  onComplete,
}: {
  buildContent: string;
  onComplete: () => void;
}) {
  const sections = parseBuildContentSections(buildContent);

  return (
    <section className="flex flex-col gap-6">
      <div className="border border-border bg-card p-6 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 bg-primary" />
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Build
          </span>
        </div>

        <div className="mt-5 space-y-5">
          {sections.map((section, index) =>
            section.move === "worked_example" ? (
              <div
                key={`${section.move}-${index}`}
                className="border border-border/80 bg-background/45 px-5 py-4"
              >
                <p className="mb-3 text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground">
                  Worked Example
                </p>
                <p className="whitespace-pre-wrap text-[15px] leading-8 text-foreground/80">
                  {section.content}
                </p>
              </div>
            ) : (
              <p
                key={`${section.move}-${index}`}
                className="whitespace-pre-wrap text-[15px] leading-8 text-foreground/78"
              >
                {section.content}
              </p>
            ),
          )}
        </div>
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
