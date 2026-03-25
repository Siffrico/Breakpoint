"use client";

import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import type { RouterOutputs } from "@acme/api";

type BuildScenario = RouterOutputs["becoming"]["getCapstone"]["capstone"]["scenario"] & {
  format: "build";
};
type CapstoneMessage = RouterOutputs["becoming"]["getCapstone"]["messages"][number];

export function BuildCapstone({
  scenario,
  messages,
  response,
  onResponseChange,
  onSubmit,
  isSubmitting,
  status,
  remainingRounds,
}: {
  scenario: BuildScenario;
  messages: CapstoneMessage[];
  response: string;
  onResponseChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  status: string;
  remainingRounds: number;
}) {
  return (
    <section className="border border-border bg-card p-6">
      <div className="space-y-6">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Build capstone
          </div>
          <h2 className="font-display mt-3 text-3xl tracking-[-0.04em]">
            {scenario.title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {scenario.briefing}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Artifact
            </div>
            <div className="mt-3 text-sm text-foreground">{scenario.artifactType}</div>
          </div>

          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Revisions left
            </div>
            <div className="mt-3 text-sm text-foreground">{remainingRounds}</div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Constraints
            </div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
              {scenario.constraints.map((constraint) => (
                <div key={constraint}>{constraint}</div>
              ))}
            </div>
          </div>

          <div className="border border-border/70 p-4">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Evaluation criteria
            </div>
            <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
              {scenario.evaluationCriteria.map((criterion) => (
                <div key={criterion}>{criterion}</div>
              ))}
            </div>
          </div>
        </div>

        {messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className="border border-border/70 p-4 text-sm leading-7 text-muted-foreground"
              >
                <span className="font-mono mr-3 text-xs uppercase tracking-[0.18em] text-foreground/70">
                  {message.role}
                </span>
                {message.content}
              </div>
            ))}
          </div>
        ) : null}

        <Textarea
          value={response}
          onChange={(event) => onResponseChange(event.target.value)}
          disabled={status === "passed" || status === "failed" || isSubmitting}
          placeholder="Submit the artifact, memo, or framework you built."
          className="min-h-[260px] rounded-none border-border bg-background px-4 py-4 text-sm leading-7 shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Strong submissions make tradeoffs explicit and satisfy the constraints directly.
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
            {isSubmitting ? "Submitting..." : "Submit build"}
          </Button>
        </div>
      </div>
    </section>
  );
}
