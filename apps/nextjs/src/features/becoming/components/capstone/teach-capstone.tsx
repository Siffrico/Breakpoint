"use client";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import type { RouterOutputs } from "@acme/api";

type TeachScenario = RouterOutputs["becoming"]["getCapstone"]["capstone"]["scenario"] & {
  format: "teach";
};
type CapstoneMessage = RouterOutputs["becoming"]["getCapstone"]["messages"][number];

export function TeachCapstone({
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
  scenario: TeachScenario;
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
            Teach capstone
          </div>
          <h2 className="font-display mt-3 text-3xl tracking-[-0.04em]">
            {scenario.title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {scenario.deliveryGoal}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Audience
            </div>
            <div className="mt-3 text-sm leading-7 text-foreground">
              {scenario.audience}
            </div>
          </div>

          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Constraint
            </div>
            <div className="mt-3 text-sm leading-7 text-foreground">
              {scenario.audienceContext}
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
          placeholder="Teach the idea clearly, then answer the audience's pushback without losing the core insight."
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
            {isSubmitting ? "Submitting..." : "Submit explanation"}
          </Button>
        </div>
      </div>
    </section>
  );
}
