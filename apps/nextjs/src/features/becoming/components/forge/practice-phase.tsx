"use client";

import { useState } from "react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import type { PracticePrompt } from "~/features/becoming/lib/forge-preview";

interface PracticeResult {
  passed: boolean;
  feedback: string;
}

const roundMeta: Record<
  PracticePrompt["type"],
  { label: string; description: string }
> = {
  identification: {
    label: "Identification",
    description: "Reanalyze something real from your past with the new model.",
  },
  construction: {
    label: "Construction",
    description: "Build a concrete tool, system, or move that uses the principle.",
  },
  debugging: {
    label: "Debugging",
    description: "Diagnose a broken scenario, name the mechanism, and fix it.",
  },
};

export function PracticePhase({
  practicePrompts,
  onSubmitPractice,
  onComplete,
  preview,
  previewResults,
}: {
  practicePrompts: PracticePrompt[];
  onSubmitPractice?: (
    sequence: number,
    response: string,
  ) => Promise<PracticeResult | void> | PracticeResult | void;
  onComplete: () => void;
  preview?: boolean;
  previewResults?: PracticeResult[];
}) {
  const [responses, setResponses] = useState<string[]>(
    practicePrompts.map(() => ""),
  );
  const [results, setResults] = useState<(PracticeResult | null)[]>(
    practicePrompts.map(() => null),
  );
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const allPassed = results.every((result) => result?.passed);

  async function handleSubmit(sequence: number) {
    if (preview && previewResults?.[sequence]) {
      setResults((current) => {
        const next = [...current];
        next[sequence] = previewResults[sequence] ?? null;
        return next;
      });
      return;
    }

    setPendingIndex(sequence);
    try {
      const result = await onSubmitPractice?.(
        sequence,
        responses[sequence] ?? "",
      );

      if (!result) {
        return;
      }

      setResults((current) => {
        const next = [...current];
        next[sequence] = result;
        return next;
      });
    } finally {
      setPendingIndex(null);
    }
  }

  return (
    <section className="flex flex-col gap-0">
      {practicePrompts.map((practicePrompt, index) => {
        const isLocked = index > 0 && !results.slice(0, index).every((result) => result?.passed);
        const result = results[index];
        const response = responses[index] ?? "";
        const meta = roundMeta[practicePrompt.type];
        const canSubmit = response.trim().length >= 30;

        return (
          <div
            key={`${practicePrompt.type}-${index}`}
            className={cn(
              "border border-border bg-card p-6 transition-opacity duration-300",
              index > 0 && "-mt-px",
              isLocked && "pointer-events-none select-none opacity-30",
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                Round {index + 1}
              </span>
              <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-primary/70">
                {meta.label}
              </span>
            </div>

            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {meta.description}
            </p>
            <p className="mt-4 text-sm leading-8 text-foreground/78">
              {practicePrompt.prompt}
            </p>

            <Textarea
              value={response}
              onChange={(event) =>
                setResponses((current) => {
                  const next = [...current];
                  next[index] = event.target.value;
                  return next;
                })
              }
              disabled={isLocked || pendingIndex === index || result?.passed}
              placeholder="Apply the concept directly. Vague answers will fail."
              className="mt-5 min-h-[140px] border-border bg-transparent px-4 py-4 text-sm leading-7 text-foreground shadow-none focus-visible:ring-0"
            />

            {result ? (
              <div
                className={cn(
                  "mt-4 border p-4 text-sm leading-7",
                  result.passed
                    ? "border-primary/20 bg-primary/5 text-foreground/72"
                    : "border-destructive/20 bg-destructive/5 text-foreground/72",
                )}
              >
                {result.feedback}
              </div>
            ) : null}

            {!result?.passed ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">
                  {canSubmit
                    ? "Ready to evaluate."
                    : `${Math.max(0, 30 - response.trim().length)} more characters.`}
                </span>
                <Button
                  type="button"
                  onClick={() => handleSubmit(index)}
                  disabled={!canSubmit || isLocked || pendingIndex === index}
                  className="h-10 bg-foreground px-5 text-background hover:bg-foreground/90"
                >
                  {pendingIndex === index ? "Evaluating..." : "Submit"}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}

      {allPassed ? (
        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            onClick={onComplete}
            className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
          >
            Continue to Prove
          </Button>
        </div>
      ) : null}
    </section>
  );
}
