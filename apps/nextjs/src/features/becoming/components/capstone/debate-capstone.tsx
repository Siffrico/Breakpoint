"use client";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import type { RouterOutputs } from "@acme/api";

type DebateScenario = RouterOutputs["becoming"]["getCapstone"]["capstone"]["scenario"] & {
  format: "debate";
};
type CapstoneMessage = RouterOutputs["becoming"]["getCapstone"]["messages"][number];

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
    <section className="border border-border bg-card p-6">
      <div className="space-y-6">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Debate capstone
          </div>
          <h2 className="font-display mt-3 text-3xl tracking-[-0.04em]">
            {scenario.title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {scenario.context}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Resolution
            </div>
            <div className="mt-3 text-sm leading-7 text-foreground">
              {scenario.resolution}
            </div>
          </div>

          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Opposition
            </div>
            <div className="mt-3 text-sm leading-7 text-foreground">
              {scenario.aiPosition}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className="border border-border/70 p-4 text-sm leading-7 text-muted-foreground"
            >
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/70">
                {message.role} · round {message.round || 1}
              </div>
              <div className="mt-2">{message.content}</div>
            </div>
          ))}
        </div>

        <Textarea
          value={response}
          onChange={(event) => onResponseChange(event.target.value)}
          disabled={status === "passed" || status === "failed" || isSubmitting}
          placeholder="Argue against the assistant's position using the cluster's concepts, tradeoffs, and failure modes."
          className="min-h-[220px] rounded-none border-border bg-background px-4 py-4 text-sm leading-7 shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
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
