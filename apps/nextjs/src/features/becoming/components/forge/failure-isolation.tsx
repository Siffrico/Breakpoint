"use client";

import { useEffect, useState } from "react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import type {
  FailureGap,
  GhostScenario,
} from "~/features/becoming/lib/forge-preview";

interface GhostEvaluation {
  passed: boolean;
  feedback: string;
  score: number;
}

export function FailureIsolation({
  gap,
  ghostScenario,
  onSubmitGhost,
  onComplete,
  onRetryGhost,
  preview,
  isRefreshing,
}: {
  gap: FailureGap;
  ghostScenario: GhostScenario;
  onSubmitGhost?: (
    response: string,
  ) => Promise<GhostEvaluation | void> | GhostEvaluation | void;
  onComplete: () => void;
  onRetryGhost?: () => Promise<void> | void;
  preview?: boolean;
  isRefreshing?: boolean;
}) {
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<GhostEvaluation | null>(null);
  const [isPending, setIsPending] = useState(false);
  const canSubmit = response.trim().length >= 50;

  useEffect(() => {
    setResponse("");
    setResult(null);
    setIsPending(false);
  }, [gap.description, ghostScenario.prompt]);

  async function handleSubmit() {
    if (preview) {
      setResult({
        passed: true,
        feedback: "Ghost scenario complete in preview mode.",
        score: 82,
      });
      return;
    }

    setIsPending(true);
    try {
      const evaluation = await onSubmitGhost?.(response.trim());
      if (evaluation) {
        setResult(evaluation);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-0">
      {/* Gap diagnosis */}
      <div className="border border-destructive/20 bg-destructive/[0.04] p-6">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 bg-destructive/70" />
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-destructive/70">
            Failure isolated
          </span>
        </div>

        <p className="mt-4 text-sm leading-7 text-foreground/70">
          {gap.description}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <span className="border border-border px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
            {gap.gapType.replaceAll("-", " ")}
          </span>
        </div>

        <div className="mt-4 border-t border-destructive/10 pt-4">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/70">
            Where it broke
          </span>
          <p className="mt-2 text-sm leading-7 text-foreground/60">
            {gap.whereItBroke}
          </p>
        </div>
      </div>

      {/* Ghost scenario */}
      <div className="border border-border bg-card p-6 -mt-px">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 bg-primary" />
            <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Ghost scenario
            </span>
          </div>
          <span className="border border-border px-3 py-1.5 text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/60">
            {ghostScenario.domain}
          </span>
        </div>

        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Same cognitive demand, new context. You can't memorize your way out.
        </p>

        <div className="mt-4 border border-border bg-secondary/30 p-5">
          <p className="text-[15px] leading-8 text-foreground/75">
            {ghostScenario.prompt}
          </p>
        </div>

        {!result ? (
          <>
            <Textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              disabled={isPending}
              placeholder="Apply what you learned from the failure diagnosis..."
              className="mt-5 min-h-[160px] border-border bg-transparent px-4 py-4 text-sm leading-7 text-foreground shadow-none focus-visible:ring-0"
            />

            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                {canSubmit
                  ? "Ready."
                  : `${Math.max(0, 50 - response.trim().length)} more characters.`}
              </span>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || isPending}
                className="h-10 bg-foreground px-5 text-background hover:bg-foreground/90"
              >
                {isPending ? "Evaluating..." : "Submit"}
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-5 space-y-5">
            <div
              className={cn(
                "border p-4 text-sm leading-7",
                result.passed
                  ? "border-primary/20 bg-primary/5 text-foreground/70"
                  : "border-destructive/20 bg-destructive/5 text-foreground/70",
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                  {result.passed ? "Ghost passed" : "Ghost still exposed the gap"}
                </span>
                <span className="font-display text-2xl tracking-[-0.04em] text-foreground">
                  {result.score}
                </span>
              </div>
              <p className="mt-3">{result.feedback}</p>
            </div>

            <div className="flex justify-end gap-3">
              {result.passed ? (
                <Button
                  type="button"
                  onClick={onComplete}
                  className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
                >
                  Continue to debrief
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void onRetryGhost?.()}
                  disabled={isRefreshing}
                  className="h-11 bg-foreground px-6 text-background hover:bg-foreground/90"
                >
                  {isRefreshing ? "Generating..." : "Generate another ghost"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
