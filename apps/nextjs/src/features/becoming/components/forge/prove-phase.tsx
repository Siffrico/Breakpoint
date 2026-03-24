"use client";

import { useEffect, useState } from "react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

import type { TeachbackMessage } from "~/features/becoming/lib/forge-preview";

interface TeachbackResult {
  passed: boolean;
  score: number;
  feedback: string;
}

interface TeachbackRoundResponse {
  studentReply: string | null;
  passed: boolean;
  round: number;
  score: number | null;
  feedback: string | null;
}

export function ProvePhase({
  studentPersona,
  openingMisconception,
  startingRound = 1,
  onSubmitResponse,
  onComplete,
  preview,
  previewTranscript,
  previewResult,
}: {
  studentPersona: string;
  openingMisconception: string;
  startingRound?: number;
  onSubmitResponse?: (
    round: number,
    response: string,
  ) => Promise<TeachbackRoundResponse | void> | TeachbackRoundResponse | void;
  onComplete: (passed: boolean) => void;
  preview?: boolean;
  previewTranscript?: TeachbackMessage[];
  previewResult?: TeachbackResult;
}) {
  const [transcript, setTranscript] = useState<TeachbackMessage[]>([
    { role: "student", content: openingMisconception, round: 1 },
  ]);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentRound, setCurrentRound] = useState(1);
  const [result, setResult] = useState<TeachbackResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  const maxRounds = 3;
  const canSubmit = currentResponse.trim().length >= 50;

  useEffect(() => {
    setTranscript((current) => {
      if (current.length !== 1 || current[0]?.role !== "student") {
        return current;
      }

      return [
        { role: "student", content: openingMisconception, round: startingRound },
      ];
    });
    setCurrentRound((current) => (current === 1 ? startingRound : current));
  }, [openingMisconception, startingRound]);

  async function handleSubmit() {
    const userMessage: TeachbackMessage = {
      role: "user",
      content: currentResponse.trim(),
      round: currentRound,
    };

    const nextTranscript = [...transcript, userMessage];
    setTranscript(nextTranscript);
    setCurrentResponse("");

    if (preview && previewTranscript && previewResult) {
      const nextStudentMessage = previewTranscript.find(
        (m) => m.role === "student" && m.round === currentRound + 1,
      );

      if (nextStudentMessage && currentRound < maxRounds) {
        setTranscript([...nextTranscript, nextStudentMessage]);
        setCurrentRound(currentRound + 1);
      } else {
        setResult(previewResult);
      }
      return;
    }

    setIsPending(true);
    try {
      const roundResult = await onSubmitResponse?.(
        currentRound,
        userMessage.content,
      );

      if (!roundResult) {
        return;
      }

      if (roundResult.studentReply && currentRound < maxRounds) {
        setTranscript([
          ...nextTranscript,
          {
            role: "student",
            content: roundResult.studentReply,
            round: currentRound + 1,
          },
        ]);
        setCurrentRound(currentRound + 1);
        return;
      }

      setResult({
        passed: roundResult.passed,
        score: roundResult.score ?? 0,
        feedback: roundResult.feedback ?? "Teach-back complete.",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="border border-border bg-card p-6 shadow-[0_18px_80px_rgba(2,6,23,0.18)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 bg-primary" />
            <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Teach-back
            </span>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: maxRounds }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-6 transition-colors duration-200",
                  i < currentRound ? "bg-primary/60" : "bg-border",
                )}
              />
            ))}
            <span className="ml-2 text-xs text-muted-foreground">
              Round {currentRound}/{maxRounds}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          You're explaining to a smart but skeptical peer. They'll push back.
          Defend your understanding.
        </p>
      </div>

      {/* Conversation transcript */}
      <div className="flex flex-col gap-0">
        {transcript.map((message, index) => (
          <div
            key={index}
            className={cn(
              "border border-border p-5 transition-all duration-200",
              index > 0 && "-mt-px",
              message.role === "student"
                ? "bg-secondary/40"
                : "bg-card",
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-medium tracking-[0.2em] uppercase",
                  message.role === "student"
                    ? "text-destructive/70"
                    : "text-primary/70",
                )}
              >
                {message.role === "student" ? "Skeptic" : "You"}
              </span>
              <span className="text-[10px] text-muted-foreground/50">
                Round {message.round}
              </span>
            </div>
            <p className="text-sm leading-7 text-foreground/75">
              {message.content}
            </p>
          </div>
        ))}
      </div>

      {/* Response input or result */}
      {!result ? (
        <div className="border border-border bg-card p-6">
          <Textarea
            value={currentResponse}
            onChange={(e) => setCurrentResponse(e.target.value)}
            disabled={isPending}
            placeholder="Respond to their objection. Be precise, use examples, and don't concede ground you shouldn't."
            className="min-h-[140px] border-border bg-transparent px-4 py-4 text-sm leading-7 text-foreground shadow-none focus-visible:ring-0"
          />

          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">
              {canSubmit
                ? "Ready."
                : `${Math.max(0, 50 - currentResponse.trim().length)} more characters.`}
            </span>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              className="h-10 bg-foreground px-5 text-background hover:bg-foreground/90"
            >
              {isPending ? "Thinking..." : "Respond"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-2 w-2",
                  result.passed ? "bg-primary" : "bg-destructive",
                )}
              />
              <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                {result.passed ? "Teach-back passed" : "Teach-back needs repair"}
              </span>
            </div>
            <span className="font-display text-2xl tracking-[-0.04em] text-foreground">
              {result.score}
            </span>
          </div>

          <p className="mt-4 text-sm leading-7 text-foreground/70">
            {result.feedback}
          </p>

          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              onClick={() => onComplete(result.passed)}
              className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
            >
              {result.passed ? "Continue to debrief" : "Continue to repair"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
