"use client";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import { AssistantRichText } from "../assistant-rich-text";

type BuildScenario =
  RouterOutputs["training"]["getCapstone"]["capstone"]["scenario"] & {
    format: "build";
  };
type CapstoneMessage =
  RouterOutputs["training"]["getCapstone"]["messages"][number];

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
    <section className="border-border bg-card border p-6">
      <div className="space-y-6">
        <div>
          <div className="text-muted-foreground font-mono text-xs tracking-[0.24em] uppercase">
            Build capstone
          </div>
          <h2
            className="font-display mt-3 text-3xl tracking-[-0.04em]"
          >
            <AssistantRichText content={scenario.title} />
          </h2>
          <AssistantRichText
            content={scenario.briefing}
            className="text-muted-foreground mt-4 text-sm leading-7"
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border-border/70 border p-4">
            <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Artifact
            </div>
            <AssistantRichText
              content={scenario.artifactType}
              className="text-foreground mt-3 text-sm"
            />
          </div>

          <div className="border-border/70 border p-4">
            <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Revisions left
            </div>
            <div className="text-foreground mt-3 text-sm">
              {remainingRounds}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="border-border/70 border p-4">
            <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Constraints
            </div>
            <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-7">
              {scenario.constraints.map((constraint) => (
                <AssistantRichText key={constraint} content={constraint} />
              ))}
            </div>
          </div>

          <div className="border-border/70 border p-4">
            <div className="text-muted-foreground font-mono text-xs tracking-[0.18em] uppercase">
              Evaluation criteria
            </div>
            <div className="text-muted-foreground mt-3 space-y-3 text-sm leading-7">
              {scenario.evaluationCriteria.map((criterion) => (
                <AssistantRichText key={criterion} content={criterion} />
              ))}
            </div>
          </div>
        </div>

        {messages.length > 0 ? (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className="border-border/70 text-muted-foreground border p-4 text-sm leading-7"
              >
                <span className="text-foreground/70 mr-3 font-mono text-xs tracking-[0.18em] uppercase">
                  {message.role}
                </span>
                {message.role === "assistant" ? (
                  <AssistantRichText content={message.content} />
                ) : (
                  message.content
                )}
              </div>
            ))}
          </div>
        ) : null}

        <Textarea
          value={response}
          onChange={(event) => onResponseChange(event.target.value)}
          disabled={status === "passed" || status === "failed" || isSubmitting}
          placeholder="Submit the artifact, memo, or framework you built."
          className="border-border bg-background min-h-[260px] rounded-none p-4 text-sm leading-7 shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-4">
          <div className="text-muted-foreground text-sm">
            Strong submissions make tradeoffs explicit and satisfy the
            constraints directly.
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
