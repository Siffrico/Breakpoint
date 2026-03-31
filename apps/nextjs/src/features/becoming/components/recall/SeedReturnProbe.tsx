"use client";

import { useState } from "react";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

export function SeedReturnProbe({
  prompt,
  seedSnapshot,
  onSubmit,
  disabled = false,
  isPending = false,
}: {
  prompt: string;
  seedSnapshot: string | null;
  onSubmit: (response: string) => Promise<void>;
  disabled?: boolean;
  isPending?: boolean;
}) {
  const [response, setResponse] = useState("");

  return (
    <section className="border border-border bg-card p-6">
      {seedSnapshot ? (
        <div className="border border-border bg-secondary/30 p-4">
          <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            Original seed
          </div>
          <p className="mt-3 text-sm leading-7 text-foreground/60 italic">
            "{seedSnapshot}"
          </p>
        </div>
      ) : null}

      <p className="mt-5 text-sm leading-7 text-foreground/80">{prompt}</p>

      <Textarea
        value={response}
        onChange={(event) => setResponse(event.target.value)}
        disabled={disabled || isPending}
        className="mt-5 min-h-40 border-border bg-background px-4 py-4 text-sm leading-7 shadow-none focus-visible:ring-0"
        placeholder="Name the flaw in your earlier reasoning, then state what you see now."
      />

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          disabled={disabled || isPending || response.trim().length < 20}
          onClick={() => onSubmit(response)}
          className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
        >
          {isPending ? "Checking..." : "Submit recall"}
        </Button>
      </div>
    </section>
  );
}
