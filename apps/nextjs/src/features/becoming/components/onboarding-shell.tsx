"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { previewOnboardingStates } from "~/features/becoming/lib/becoming-preview";
import { useTRPC } from "~/trpc/react";

type OnboardingState = RouterOutputs["becoming"]["startOnboarding"];
const TOTAL_ONBOARDING_ANSWERS = 4;

export function OnboardingShell({ preview = false }: { preview?: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);

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
    if (preview) {
      const previewState =
        previewOnboardingStates[previewStep] ?? previewOnboardingStates[0];
      if (previewState) {
        setState(previewState);
      }
      return;
    }

    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    startOnboarding.mutate();
  }, [preview, previewStep, startOnboarding]);

  const handleSubmit = () => {
    if (!state || !answer.trim() || submitAnswer.isPending || isGenerating) {
      return;
    }

    if (preview) {
      const nextStep = Math.min(previewStep + 1, previewOnboardingStates.length - 1);
      setAnswer("");
      setPreviewStep(nextStep);

      if (nextStep === previewOnboardingStates.length - 1) {
        setIsGenerating(true);
        window.setTimeout(() => {
          router.push("/ui/plan");
        }, 700);
      }

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050709] text-white">
      {/* Concentric dark blue gradient clouds on the periphery */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(15, 30, 80, 0.5) 0%, transparent 50%)",
            "radial-gradient(ellipse 100% 70% at 50% 100%, rgba(10, 25, 70, 0.45) 0%, transparent 45%)",
            "radial-gradient(ellipse 60% 100% at 0% 50%, rgba(12, 28, 75, 0.4) 0%, transparent 40%)",
            "radial-gradient(ellipse 60% 100% at 100% 50%, rgba(12, 28, 75, 0.4) 0%, transparent 40%)",
            "radial-gradient(ellipse 140% 140% at 50% 50%, transparent 40%, rgba(8, 20, 60, 0.3) 70%, rgba(15, 35, 90, 0.15) 100%)",
          ].join(", "),
        }}
      />
      {/* Film grain overlay — canvas-generated, rendered once */}
      <GrainOverlay />

      <div className="relative z-10 mx-auto flex w-full max-w-[54rem] flex-col px-5 py-8">
        {/* Heading */}
        <div
          className={[
            "transition-all duration-500",
            isStarted ? "mb-6" : "mb-10",
          ].join(" ")}
        >
          <h1
            className={[
              "font-display tracking-[-0.03em] text-white transition-all duration-500",
              isStarted ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
            ].join(" ")}
          >
            {currentPrompt}
          </h1>
        </div>

        {/* Message transcript */}
        {isStarted && (
          <div className="mb-4 space-y-2">
            {transcript.slice(0, -1).map((message) => (
              <div
                key={`${message.role}-${message.sequence}`}
                className={[
                  "max-w-lg rounded-none px-3 py-2",
                  message.role === "assistant"
                    ? "border border-white/8 bg-white/[0.03] text-white/70"
                    : "ml-auto border border-white/12 bg-white/[0.06] text-white/90",
                ].join(" ")}
              >
                <div className="text-xs leading-5">{message.content}</div>
              </div>
            ))}
          </div>
        )}

        {/* Input area — wide rectangle */}
        <div className="w-full border border-white/[0.06] bg-[#111111]">
          <Textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              isGenerating
                    ? "Building your path..."
                    : "Type your answer..."
            }
            disabled={!state || (!preview && submitAnswer.isPending) || isGenerating}
            className="min-h-24 resize-none rounded-none border-0 bg-transparent px-5 py-4 text-sm leading-6 text-white shadow-none placeholder:text-white/20 focus-visible:ring-0"
          />

          <div className="flex items-center justify-between border-t border-white/8 px-5 py-3">
            <div className="text-[11px] text-white/30">
              {isGenerating
                ? "Generating curriculum..."
                : !preview && submitAnswer.isPending
                  ? "Thinking..."
                  : state
                    ? `${Math.max(
                        0,
                        TOTAL_ONBOARDING_ANSWERS -
                          transcript.filter((m) => m.role === "user").length,
                      )} steps left`
                    : "Starting..."}
            </div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                !state ||
                !answer.trim() ||
                (!preview && submitAnswer.isPending) ||
                isGenerating
              }
              className="h-8 rounded-none bg-white px-4 text-xs font-medium text-black hover:bg-white/90"
            >
              {isGenerating ? "Building" : "Submit"}
            </Button>
          </div>
        </div>

        {/* Suggestion cards */}
        {!isStarted && (
          <div className="mt-2 flex gap-2">
            {[
              "I want to master deep focus and ship world-class work",
              "I want to build wealth and financial independence",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setAnswer(suggestion)}
                className="flex-1 border border-white/[0.06] bg-[#111111] px-4 py-3 text-left text-xs leading-5 text-white/40 transition-colors hover:border-white/12 hover:text-white/60"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {state?.activeQuestion?.helper ? (
          <div className="mt-3 text-xs text-white/35">
            {state.activeQuestion.helper}
          </div>
        ) : null}
      </div>
    </main>
  );
}

const GRAIN_SIZE = 128;

function GrainOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const generate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = GRAIN_SIZE;
    canvas.height = GRAIN_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 18;
    }
    ctx.putImageData(imageData, 0, 0);
    setDataUrl(canvas.toDataURL("image/png"));
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <>
      <canvas ref={canvasRef} className="hidden" />
      {dataUrl && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${dataUrl})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${GRAIN_SIZE}px ${GRAIN_SIZE}px`,
          }}
        />
      )}
    </>
  );
}
