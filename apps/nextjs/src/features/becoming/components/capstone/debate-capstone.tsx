"use client";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import { AssistantRichText } from "../assistant-rich-text";

type DebateScenario =
  RouterOutputs["becoming"]["getCapstone"]["capstone"]["scenario"] & {
    format: "debate";
  };
type CapstoneMessage =
  RouterOutputs["becoming"]["getCapstone"]["messages"][number];

export function DebateCapstone({
  scenario,
  messages,
  response,
  onResponseChange,
  onSubmit,
  isSubmitting,
  status,
  currentRound,
  maxRounds,
}: {
  scenario: DebateScenario;
  messages: CapstoneMessage[];
  response: string;
  onResponseChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  status: string;
  currentRound: number;
  maxRounds: number;
}) {
  return (
    <section className="border-border bg-card border p-6">
      <div className="space-y-6">
        <div>
          <div className="text-muted-foreground font-mono text-xs tracking-[0.24em] uppercase">
            Debate capstone
          </div>
          <div
            role="heading"
            aria-level={2}
            className="font-display mt-3 text-3xl tracking-[-0.04em]"
          >
            <AssistantRichText content={scenario.title} />
          </div>
          <AssistantRichText
            content={scenario.context}
            className="text-muted-foreground mt-4 text-sm leading-7"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border-border/70 border p-4">
            <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Resolution
            </div>
            <AssistantRichText
              content={scenario.resolution}
              className="text-foreground mt-3 text-sm leading-7"
            />
          </div>

          <div className="border-border/70 border p-4">
            <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Opposition
            </div>
            <AssistantRichText
              content={scenario.aiPosition}
              className="text-foreground mt-3 text-sm leading-7"
            />
          </div>
        </div>

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className="border-border/70 text-muted-foreground border p-4 text-sm leading-7"
            >
              <div className="text-foreground/70 font-mono text-xs tracking-[0.18em] uppercase">
                {message.role} · round {message.round || 1}
              </div>
              <div className="mt-2">
                {message.role === "assistant" ? (
                  <AssistantRichText content={message.content} />
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}
        </div>

        <Textarea
          value={response}
          onChange={(event) => onResponseChange(event.target.value)}
          disabled={status === "passed" || status === "failed" || isSubmitting}
          placeholder="Argue against the assistant's position using the cluster's concepts, tradeoffs, and failure modes."
          className="border-border bg-background min-h-[220px] rounded-none px-4 py-4 text-sm leading-7 shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="text-muted-foreground text-sm">
            Round {Math.min(currentRound + 1, maxRounds)} of {maxRounds}
          </div>
          <Button
            type="button"
            disabled={
              isSubmitting ||
              status === "passed" ||
              status === "failed" ||
              response.trim().length < 50
            }
            onClick={onSubmit}
            className="h-11 rounded-none bg-white px-5 text-black hover:bg-white/90"
          >
            {isSubmitting ? "Submitting..." : "Submit argument"}
          </Button>
        </div>
      </div>
    </section>
  );
}
