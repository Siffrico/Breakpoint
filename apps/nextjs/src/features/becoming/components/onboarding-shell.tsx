"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

type OnboardingState = RouterOutputs["becoming"]["startOnboarding"];

export function OnboardingShell() {
  const trpc = useTRPC();
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const startOnboarding = useMutation(
    trpc.becoming.startOnboarding.mutationOptions({
      onSuccess: (data) => setState(data),
      onError: (error) => toast.error(error.message),
    }),
  );

  const generateCurriculum = useMutation(
    trpc.becoming.generateCurriculum.mutationOptions({
      onSuccess: (plan) => {
        if (!state) {
          return;
        }

        router.push(`/plan?session=${state.sessionId}&unit=${plan.nextUnitId ?? ""}`);
      },
      onError: (error) => {
        setIsGenerating(false);
        toast.error(error.message);
      },
    }),
  );

  const submitAnswer = useMutation(
    trpc.becoming.submitOnboardingAnswer.mutationOptions({
      onSuccess: async (data) => {
        setState(data);
        setAnswer("");

        if (data.phase === "ready_for_generation") {
          setIsGenerating(true);
          await generateCurriculum.mutateAsync({ sessionId: data.sessionId });
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    startOnboarding.mutate();
  }, [startOnboarding]);

  const handleSubmit = () => {
    if (!state || !answer.trim() || submitAnswer.isPending || isGenerating) {
      return;
    }

    submitAnswer.mutate({
      sessionId: state.sessionId,
      answer,
    });
  };

  const transcript = state?.transcript ?? [];
  const isStarted = transcript.some((message) => message.role === "user");
  const currentPrompt =
    transcript
      .slice()
      .reverse()
      .find((message) => message.role === "assistant")?.content ??
    "Who do you want to become?";

  return (
    <main className="min-h-screen bg-[#07080b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between border-b border-white/8 pb-4">
          <div className="text-sm tracking-[0.28em] uppercase text-white/40">
            Breakpoint
          </div>
          <div className="text-xs tracking-[0.24em] uppercase text-white/30">
            Becoming Intake
          </div>
        </div>

        <div
          className={[
            "flex flex-1 flex-col transition-all duration-500",
            isStarted ? "justify-start pt-10" : "justify-center",
          ].join(" ")}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
            <div
              className={[
                "transition-all duration-500",
                isStarted ? "mb-8" : "mb-10",
              ].join(" ")}
            >
              <p className="mb-4 text-xs tracking-[0.3em] uppercase text-white/35">
                Start Here
              </p>
              <h1
                className={[
                  "font-display max-w-3xl tracking-[-0.06em] text-white transition-all duration-500",
                  isStarted ? "text-4xl sm:text-5xl" : "text-5xl sm:text-7xl",
                ].join(" ")}
              >
                {currentPrompt}
              </h1>
            </div>

            <div className="flex-1">
              <div className="space-y-3 pb-6">
                {transcript.slice(0, -1).map((message) => (
                  <div
                    key={`${message.role}-${message.sequence}`}
                    className={[
                      "max-w-3xl border px-4 py-3 transition-all",
                      message.role === "assistant"
                        ? "border-white/10 bg-white/[0.03] text-white/80"
                        : "ml-auto border-white/16 bg-white/[0.06] text-white",
                    ].join(" ")}
                  >
                    <div className="text-sm leading-7">{message.content}</div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={[
                "border border-white/12 bg-[#0d0f14] transition-all duration-500",
                isStarted ? "max-w-3xl" : "max-w-4xl",
              ].join(" ")}
            >
              <Textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={
                  isGenerating
                    ? "Building your path..."
                    : "Write with signal. This is what everything will be built from."
                }
                disabled={!state || submitAnswer.isPending || isGenerating}
                className="min-h-40 rounded-none border-0 bg-transparent px-5 py-5 text-base leading-8 text-white shadow-none placeholder:text-white/25 focus-visible:ring-0"
              />

              <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
                <div className="text-xs tracking-[0.22em] uppercase text-white/35">
                  {isGenerating
                    ? "Generating curriculum"
                    : submitAnswer.isPending
                      ? "Synthesizing next question"
                      : state
                        ? `${Math.max(0, 5 - transcript.filter((m) => m.role === "user").length)} steps left`
                        : "Starting"}
                </div>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!state || !answer.trim() || submitAnswer.isPending || isGenerating}
                  className="h-11 rounded-none border border-white/15 bg-white px-5 text-sm font-medium text-black hover:bg-white/90"
                >
                  {isGenerating ? "Building" : "Submit"}
                </Button>
              </div>
            </div>

            {state?.activeQuestion?.helper ? (
              <div className="mt-4 text-sm text-white/40">
                {state.activeQuestion.helper}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
