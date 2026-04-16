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
import { AssistantRichText } from "./assistant-rich-text";

type OnboardingState =
  | RouterOutputs["becoming"]["startOnboarding"]
  | RouterOutputs["becoming"]["onboardingState"];

const TOTAL_ONBOARDING_ANSWERS = 4;

type OnboardingVariant = "default" | "landscape";

export function OnboardingShell({
  preview = false,
  embedded = false,
  sessionId,
  initialState = null,
  variant = "default",
}: {
  preview?: boolean;
  embedded?: boolean;
  sessionId?: string;
  initialState?: OnboardingState | null;
  variant?: OnboardingVariant;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<OnboardingState | null>(initialState);
  const [answer, setAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  const startOnboarding = useMutation(
    trpc.becoming.startOnboarding.mutationOptions({
      onSuccess: (data) => setState(data),
      onError: (error) => toast.error(error.message),
    }),
  );

  const generateCurriculum = useMutation(
    trpc.becoming.generateCurriculum.mutationOptions({
      onSuccess: (plan) => {
        const activeSessionId = state?.sessionId ?? sessionId;
        if (!activeSessionId) {
          return;
        }

        if (embedded) {
          router.push(`/home?session=${activeSessionId}`);
          router.refresh();
          return;
        }

        router.push(
          `/transformation?session=${activeSessionId}&unit=${plan.nextUnitId ?? ""}`,
        );
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

    if (initialState || sessionId || startedRef.current) {
      return;
    }

    startedRef.current = true;
    startOnboarding.mutate();
  }, [initialState, preview, previewStep, sessionId, startOnboarding]);

  useEffect(() => {
    if (
      preview ||
      !state ||
      state.phase !== "ready_for_generation" ||
      isGenerating ||
      generateCurriculum.isPending
    ) {
      return;
    }

    setIsGenerating(true);
    void generateCurriculum.mutateAsync({ sessionId: state.sessionId });
  }, [generateCurriculum, isGenerating, preview, state]);

  const handleSubmit = () => {
    if (!state || !answer.trim() || submitAnswer.isPending || isGenerating) {
      return;
    }

    if (preview) {
      const nextStep = Math.min(
        previewStep + 1,
        previewOnboardingStates.length - 1,
      );
      setAnswer("");
      setPreviewStep(nextStep);

      if (nextStep === previewOnboardingStates.length - 1) {
        setIsGenerating(true);
        window.setTimeout(() => {
          router.push("/ui/transformation");
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

  const isLandscape = variant === "landscape";
  const shellClassName = isLandscape
    ? "relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden"
    : embedded
      ? "relative flex min-h-[70vh] flex-col text-white"
      : "relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050709] text-white";
  const contentClassName = isLandscape
    ? "relative z-10 mx-auto flex w-full max-w-[42rem] flex-col px-6"
    : embedded
      ? "relative z-10 mx-auto flex w-full max-w-[54rem] flex-col"
      : "relative z-10 mx-auto flex w-full max-w-[54rem] flex-col px-5 py-8";

  return (
    <main className={shellClassName}>
      {isLandscape ? (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, #cfe8ff 0%, #e9f4ff 45%, #f5f1e6 100%)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5" />
        </>
      ) : null}

      {!embedded && !isLandscape ? (
        <>
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
          <GrainOverlay />
        </>
      ) : null}

      <div className={contentClassName}>
        <div
          className={[
            "transition-all duration-500",
            isStarted ? "mb-6" : "mb-10",
          ].join(" ")}
        >
          <div
            role="heading"
            aria-level={1}
            className={[
              "font-display tracking-[-0.03em] transition-all duration-500",
              isLandscape
                ? "text-center text-[#0f1a2e] drop-shadow-[0_1px_0_rgba(255,255,255,0.4)]"
                : "text-white",
              isStarted ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
            ].join(" ")}
          >
            <AssistantRichText content={currentPrompt} />
          </div>
        </div>

        {isStarted ? (
          <div className="mb-4 space-y-2">
            {transcript.slice(0, -1).map((message) => (
              <div
                key={`${message.role}-${message.sequence}`}
                className={[
                  "max-w-lg rounded-none px-3 py-2",
                  isLandscape
                    ? message.role === "assistant"
                      ? "border border-black/10 bg-white/70 text-[#1a2742] backdrop-blur-sm"
                      : "ml-auto border border-[#0f1a2e]/15 bg-white/85 text-[#0f1a2e] backdrop-blur-sm"
                    : message.role === "assistant"
                      ? "border border-white/8 bg-white/[0.03] text-white/70"
                      : "ml-auto border border-white/12 bg-white/[0.06] text-white/90",
                ].join(" ")}
              >
                <div className="text-xs leading-5">
                  {message.role === "assistant" ? (
                    <AssistantRichText content={message.content} />
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div
          className={
            isLandscape
              ? "w-full rounded-none border border-black/10 bg-white/92 shadow-[0_10px_30px_-16px_rgba(15,26,46,0.35)] backdrop-blur"
              : "w-full border border-white/[0.06] bg-[#111111]"
          }
        >
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
              isGenerating ? "Building your path..." : "Type your answer..."
            }
            disabled={
              !state || (!preview && submitAnswer.isPending) || isGenerating
            }
            className={
              isLandscape
                ? "min-h-24 resize-none rounded-none border-0 bg-transparent px-5 py-4 text-sm leading-6 text-[#0f1a2e] shadow-none placeholder:text-[#0f1a2e]/40 focus-visible:ring-0"
                : "min-h-24 resize-none rounded-none border-0 bg-transparent px-5 py-4 text-sm leading-6 text-white shadow-none placeholder:text-white/20 focus-visible:ring-0"
            }
          />

          <div
            className={[
              "flex items-center justify-between px-5 py-3",
              isLandscape ? "border-t border-black/8" : "border-t border-white/8",
            ].join(" ")}
          >
            <div
              className={[
                "text-[11px]",
                isLandscape ? "text-[#0f1a2e]/45" : "text-white/30",
              ].join(" ")}
            >
              {isGenerating
                ? "Generating curriculum..."
                : !preview && submitAnswer.isPending
                  ? "Thinking..."
                  : state
                    ? `${Math.max(
                        0,
                        TOTAL_ONBOARDING_ANSWERS -
                          transcript.filter(
                            (message) => message.role === "user",
                          ).length,
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
              className={
                isLandscape
                  ? "h-8 rounded-none bg-[#0f1a2e] px-4 text-xs font-medium text-white hover:bg-[#0f1a2e]/90"
                  : "h-8 rounded-none bg-white px-4 text-xs font-medium text-black hover:bg-white/90"
              }
            >
              {isGenerating ? "Building" : "Submit"}
            </Button>
          </div>
        </div>

        {!isStarted ? (
          <div className="mt-2 flex gap-2">
            {[
              "I want to master deep focus and ship world-class work",
              "I want to build wealth and financial independence",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setAnswer(suggestion)}
                className={
                  isLandscape
                    ? "flex-1 rounded-none border border-black/10 bg-white/80 px-4 py-3 text-left text-xs leading-5 text-[#0f1a2e]/70 backdrop-blur-sm transition-colors hover:border-black/20 hover:text-[#0f1a2e]"
                    : "flex-1 border border-white/[0.06] bg-[#111111] px-4 py-3 text-left text-xs leading-5 text-white/40 transition-colors hover:border-white/12 hover:text-white/60"
                }
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        {state?.activeQuestion?.helper ? (
          <div
            className={[
              "mt-3 text-xs",
              isLandscape
                ? "text-center text-[#0f1a2e]/55"
                : "text-white/35",
            ].join(" ")}
          >
            <AssistantRichText content={state.activeQuestion.helper} />
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
      {dataUrl ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${dataUrl})`,
            backgroundRepeat: "repeat",
            backgroundSize: `${GRAIN_SIZE}px ${GRAIN_SIZE}px`,
          }}
        />
      ) : null}
    </>
  );
}
