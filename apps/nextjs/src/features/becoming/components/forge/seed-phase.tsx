"use client";

import { useState } from "react";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

export function SeedPhase({
  seedPrompt,
  seedHint,
  onSubmit,
}: {
  seedPrompt: string;
  seedHint: string;
  onSubmit: (response: string) => Promise<void> | void;
}) {
  const [response, setResponse] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const canSubmit = response.trim().length >= 20;

  async function handleSubmit() {
    setIsPending(true);

    try {
      await onSubmit(response.trim());
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="border border-border bg-card p-6 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 bg-primary" />
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Before you learn
          </span>
        </div>

        <p className="mt-5 max-w-3xl text-base leading-8 text-foreground/80">
          {seedPrompt}
        </p>

        <div className="mt-4 flex max-w-3xl flex-col items-start gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowHint((current) => !current)}
            className="h-auto px-0 text-xs tracking-[0.18em] uppercase text-primary/80 hover:bg-transparent hover:text-primary"
          >
            {showHint ? "Hide hint" : "Need a hint?"}
          </Button>

          {showHint ? (
            <div className="w-full border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-7 text-foreground/72">
              {seedHint}
            </div>
          ) : null}
        </div>

        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Write what you think you know..."
          className="mt-6 min-h-[160px] border-border bg-transparent px-4 py-4 text-base leading-8 text-foreground shadow-none focus-visible:ring-0"
        />

        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {canSubmit
              ? "Your intuition is captured."
              : `${Math.max(0, 20 - response.trim().length)} more characters — even a guess helps.`}
          </div>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
          >
            {isPending ? "Capturing..." : "Capture and continue"}
          </Button>
        </div>
      </div>
    </section>
  );
}
