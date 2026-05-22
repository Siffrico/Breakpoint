"use client";

import { useState } from "react";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import { AssistantRichText } from "../assistant-rich-text";

export function CompressionProbe({
  prompt,
  onSubmit,
  disabled = false,
  isPending = false,
}: {
  prompt: string;
  onSubmit: (response: string) => Promise<void>;
  disabled?: boolean;
  isPending?: boolean;
}) {
  const [response, setResponse] = useState("");

  return (
    <section className="border-border bg-card border p-6">
      <div className="text-primary/70 text-[10px] font-medium tracking-[0.2em] uppercase">
        Compression probe
      </div>
      <AssistantRichText
        content={prompt}
        className="text-foreground/80 mt-4 text-sm leading-7"
      />

      <Textarea
        value={response}
        onChange={(event) => setResponse(event.target.value)}
        disabled={disabled || isPending}
        className="border-border bg-background mt-5 min-h-32 p-4 text-sm leading-7 shadow-none focus-visible:ring-0"
        placeholder="State the connecting principle in 1 to 3 sentences."
      />

      <div className="mt-5 flex justify-end">
        <Button
          type="button"
          disabled={disabled || isPending || response.trim().length < 20}
          onClick={() => onSubmit(response)}
          className="bg-primary text-primary-foreground h-11 px-6 hover:brightness-110"
        >
          {isPending ? "Checking..." : "Submit recall"}
        </Button>
      </div>
    </section>
  );
}
