"use client";

import { Check } from "@phosphor-icons/react";

import type { StartingPointTier } from "@acme/validators";
import { Button } from "@acme/ui/button";

/**
 * Client view of the `tool-askStartingPoint` UI part. The server tool has no
 * `execute`, so the run pauses on this part until the learner taps an option and
 * we hand the result back via `addToolResult`. The tool call streams in, so we
 * render whatever fields are present and skeleton the rest.
 */
interface StartingPointOption {
  label?: string;
  tier?: StartingPointTier;
}

interface AskStartingPointPart {
  type: "tool-askStartingPoint";
  state: string;
  toolCallId: string;
  input?: {
    question?: string;
    options?: StartingPointOption[];
  };
  output?: {
    tier: StartingPointTier;
    label: string;
  };
}

const CARD_CLASS =
  "border-border bg-card animate-in fade-in slide-in-from-bottom-1 mt-2 w-full max-w-[68ch] rounded-2xl border px-5 py-4 duration-300";

export function StartingPointCheck({
  part,
  busy = false,
  onAnswer,
}: {
  part: unknown;
  busy?: boolean;
  onAnswer: (input: {
    toolCallId: string;
    tier: StartingPointTier;
    label: string;
  }) => void;
}) {
  const toolPart = part as AskStartingPointPart;

  // Answered → collapse to a single confirmation line.
  if (toolPart.state === "output-available" && toolPart.output) {
    return (
      <div className="text-muted-foreground animate-in fade-in mt-2 flex items-center gap-2 text-[13px] leading-6 duration-300">
        <Check
          size={14}
          weight="bold"
          className="text-foreground/70 shrink-0"
        />
        <span>{toolPart.output.label}</span>
      </div>
    );
  }

  const question = toolPart.input?.question;
  const options = toolPart.input?.options ?? [];
  const interactive = toolPart.state === "input-available" && !busy;

  return (
    <div className={CARD_CLASS}>
      {question ? (
        <div className="text-foreground text-base font-medium">{question}</div>
      ) : (
        <div className="bg-muted/60 h-5 w-3/5 animate-pulse rounded" />
      )}

      <div className="mt-3 flex flex-col gap-2">
        {options.length > 0
          ? options.map((option, index) => {
              const ready =
                interactive &&
                typeof option.label === "string" &&
                typeof option.tier === "string";
              return (
                <Button
                  key={`${toolPart.toolCallId}-option-${index}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!ready}
                  className="h-auto justify-start py-2 text-left text-[13px] leading-5 whitespace-normal"
                  onClick={() => {
                    if (!option.label || !option.tier) return;
                    onAnswer({
                      toolCallId: toolPart.toolCallId,
                      tier: option.tier,
                      label: option.label,
                    });
                  }}
                >
                  {option.label ?? (
                    <span className="bg-muted/60 inline-block h-4 w-40 animate-pulse rounded" />
                  )}
                </Button>
              );
            })
          : // No options yet — skeleton three rows so the card has shape while
            // the tool input is still streaming.
            [0, 1, 2].map((index) => (
              <div
                key={`skeleton-${index}`}
                className="bg-muted/40 h-9 w-full animate-pulse rounded-md"
              />
            ))}
      </div>
    </div>
  );
}
