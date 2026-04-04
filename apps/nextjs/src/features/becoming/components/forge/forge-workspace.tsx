"use client";

import { ArrowUp } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { RecallGateView } from "~/features/becoming/components/recall/RecallGateView";

type EducationUnit = RouterOutputs["becoming"]["unit"];
type RecallGate = RouterOutputs["becoming"]["getRecallGate"];
type FinalizeForgeUnitResult = RouterOutputs["becoming"]["finalizeForgeUnit"];
type SubmitRecallProbeResult = RouterOutputs["becoming"]["submitRecallProbe"];

/* ── Message box — the bordered container like a Claude plan block ── */
function MessageBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col justify-center">
      <div className="border border-foreground/[0.08] px-6 py-5 sm:px-7 sm:py-6">
        <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h2>
        <div className="mt-3 text-[13px] leading-7 text-foreground/75">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── User response — plain text between boxes ── */
function UserResponse({ text }: { text: string }) {
  return (
    <div className="min-h-[20vh] flex items-center">
      <p className="text-[13px] leading-7 text-foreground/60">
        {text}
      </p>
    </div>
  );
}

export function ForgeWorkspace({
  unit,
  sessionId,
  preview = false,
  recallGate = null,
  embedded = false,
  onNavigate,
  onStateChange,
}: {
  unit: EducationUnit;
  sessionId: string;
  preview?: boolean;
  recallGate?: RecallGate | null;
  embedded?: boolean;
  onNavigate?: (
    result: FinalizeForgeUnitResult | SubmitRecallProbeResult["nextAction"],
  ) => void;
  onStateChange?: (state: EducationUnit) => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [state, setState] = useState(unit);
  const [response, setResponse] = useState("");
  const [responseMode, setResponseMode] = useState<
    "free_response" | "multiple_choice"
  >(state.scenario.responseMode);
  const [stepStartedAt, setStepStartedAt] = useState(() => Date.now());
  const [activeRecallGate, setActiveRecallGate] = useState<RecallGate | null>(
    recallGate,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const workspaceHref = preview ? "/ui/home" : `/home?session=${sessionId}`;
  const activeCard =
    state.currentStep === "scenario" ? state.scenario : state.evaluation;
  const canSubmit = response.trim().length > 0;
  const confidence = state.attempt?.confidence ?? "medium";

  useEffect(() => {
    setResponse("");
    setResponseMode(activeCard?.responseMode ?? "free_response");
    setStepStartedAt(Date.now());
    /* Scroll to the latest content after state changes */
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [
    activeCard?.prompt,
    activeCard?.responseMode,
    state.currentStep,
    state.loopCount,
  ]);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  const submitEducationUnitStep = useMutation(
    trpc.becoming.submitEducationUnitStep.mutationOptions({
      onSuccess: (nextState) => setState(nextState),
      onError: (error) => toast.error(error.message),
    }),
  );
  const finalizeForgeUnit = useMutation(
    trpc.becoming.finalizeForgeUnit.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );
  const submitRecallProbe = useMutation(
    trpc.becoming.submitRecallProbe.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  const handleSubmit = async () => {
    if (!activeCard || preview) return;

    const nextState = await submitEducationUnitStep.mutateAsync({
      nodeId: state.nodeId,
      sessionId,
      step: state.currentStep === "scenario" ? "attempt" : "evaluate",
      response: response.trim(),
      responseMode,
      confidence,
      latencyMs: Math.max(0, Date.now() - stepStartedAt),
    });

    setState(nextState);
  };

  const navigateToNextAction = (
    result: FinalizeForgeUnitResult | SubmitRecallProbeResult["nextAction"],
  ) => {
    if (!result) return;
    if (result.nextAction === "recall_gate") {
      setActiveRecallGate(result.gate);
      return;
    }
    if (onNavigate) {
      onNavigate(result);
      return;
    }
    if (result.nextAction === "unit" || result.nextAction === "simulation") {
      router.push(`/train/${result.nodeId}?session=${sessionId}`);
      return;
    }
    router.push(`/home?session=${sessionId}`);
  };

  const handleContinue = async () => {
    if (preview) return;
    const result = await finalizeForgeUnit.mutateAsync({
      nodeId: state.nodeId,
      sessionId,
    });
    navigateToNextAction(result);
  };

  const handleRecallProbeSubmit = async (
    probeId: string,
    mode: "probe" | "repair",
    recallResponse: string,
  ) => {
    if (!activeRecallGate || preview) return;
    const result = await submitRecallProbe.mutateAsync({
      gateId: activeRecallGate.id,
      probeId,
      mode,
      response: recallResponse,
    });
    setActiveRecallGate(result.gate);
    if (result.nextAction) navigateToNextAction(result.nextAction);
  };

  const modeOptions = useMemo(
    () =>
      (activeCard?.options ?? []).map((option) => ({
        id: option.id,
        label: option.label,
      })),
    [activeCard?.options],
  );

  /* ── Build chat messages from state ── */
  const messages: React.ReactNode[] = [];

  if (activeRecallGate) {
    messages.push(
      <RecallGateView
        key="recall"
        gate={activeRecallGate}
        onSubmitProbe={handleRecallProbeSubmit}
        isPending={submitRecallProbe.isPending}
      />,
    );
  } else {
    /* Scenario — always the first message */
    if (state.scenario) {
      messages.push(
        <MessageBox key="scenario" title={state.scenario.title}>
          <p>{state.scenario.prompt}</p>
          {state.scenario.helper && (
            <p className="mt-4 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.scenario.helper}
            </p>
          )}
        </MessageBox>,
      );
    }

    /* User's scenario response — show if we've moved past scenario */
    if (state.currentStep !== "scenario" && state.attempt?.response) {
      messages.push(
        <UserResponse key="user-scenario" text={state.attempt.response} />,
      );
    }

    /* Concept reveal — appears after scenario response */
    if (state.concept) {
      messages.push(
        <MessageBox key="concept" title={state.concept.name}>
          <p>{state.concept.summary}</p>
          {state.teachExamples.length > 0 && (
            <div className="mt-6 space-y-4">
              {state.teachExamples.map((example) => (
                <div key={`${example.label}-${example.content.slice(0, 16)}`}>
                  <p>{example.content}</p>
                </div>
              ))}
            </div>
          )}
          {state.reconnectBridge && (
            <p className="mt-6 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.reconnectBridge}
            </p>
          )}
        </MessageBox>,
      );
    }

    /* Evaluation prompt — the next thing to respond to */
    if (
      state.currentStep === "evaluate" &&
      state.evaluation &&
      !state.resultFeedback
    ) {
      messages.push(
        <MessageBox key="evaluate" title={state.evaluation.title}>
          <p>{state.evaluation.prompt}</p>
          {state.evaluation.helper && (
            <p className="mt-4 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.evaluation.helper}
            </p>
          )}
        </MessageBox>,
      );
    }

    /* Feedback — after evaluation response */
    if (state.resultFeedback) {
      messages.push(
        <MessageBox
          key="feedback"
          title={state.result ? `${state.result}` : "Here's what happened"}
        >
          <p>{state.resultFeedback}</p>
          {(state.strengths.length > 0 || state.improvements.length > 0) && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {state.strengths.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-foreground/35">
                    What worked
                  </div>
                  <div className="mt-2 space-y-1.5 text-[14px] text-foreground/60">
                    {state.strengths.map((s) => (
                      <div key={s}>— {s}</div>
                    ))}
                  </div>
                </div>
              )}
              {state.improvements.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-foreground/35">
                    Where to sharpen
                  </div>
                  <div className="mt-2 space-y-1.5 text-[14px] text-foreground/60">
                    {state.improvements.map((s) => (
                      <div key={s}>— {s}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {state.score != null && (
            <div className="mt-6 font-mono text-[13px] text-foreground/30">
              {state.score}
            </div>
          )}
        </MessageBox>,
      );
    }
  }

  /* ── Input zone ── */
  const inputZone =
    !activeRecallGate && state.currentStep !== "complete" && activeCard ? (
      <div
        className={
          embedded
            ? "shrink-0 border-t border-foreground/[0.06] bg-background px-4 pt-10 pb-7 sm:px-6 sm:pt-11"
            : "mt-10"
        }
      >
        <div className={embedded ? "mx-auto w-full max-w-[760px]" : ""}>
          {responseMode === "multiple_choice" && modeOptions.length > 0 ? (
            <div>
              <div className="grid gap-2">
                {modeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setResponse(option.label)}
                    className={[
                      "border px-4 py-3 text-left text-[13px] leading-6 transition-colors",
                      response === option.label
                        ? "border-foreground/20 bg-foreground/[0.04] text-foreground"
                        : "border-foreground/[0.08] text-foreground/60 hover:border-foreground/15 hover:text-foreground/80",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    !canSubmit || submitEducationUnitStep.isPending || preview
                  }
                  aria-label="Submit response"
                  className="inline-flex h-8 w-8 items-center justify-center border border-primary bg-primary text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowUp size={14} weight="bold" />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <Textarea
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                placeholder={
                  state.currentStep === "scenario"
                    ? "What's your read on this?"
                    : "How would you approach this?"
                }
                className="min-h-[140px] rounded-none border-border bg-input text-[13px] leading-6 text-foreground placeholder:text-foreground/25 before:rounded-none shadow-none focus-visible:border-foreground/15 focus-visible:ring-0 [&_[data-slot=textarea]]:resize-none [&_[data-slot=textarea]]:px-4 [&_[data-slot=textarea]]:pt-4 [&_[data-slot=textarea]]:pb-14"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  !canSubmit || submitEducationUnitStep.isPending || preview
                }
                aria-label="Submit response"
                className="absolute right-3 bottom-3 inline-flex h-8 w-8 items-center justify-center border border-primary bg-primary text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
              >
                <ArrowUp size={14} weight="bold" />
              </button>
            </div>
          )}

          {modeOptions.length > 0 && (
            <div className="mt-4 flex items-center">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setResponseMode(
                      responseMode === "free_response"
                        ? "multiple_choice"
                        : "free_response",
                    )
                  }
                  className="border border-foreground/[0.08] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/25 transition-colors hover:bg-foreground/[0.03] hover:text-foreground/40"
                >
                  {responseMode === "free_response" ? "choices" : "free"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    ) : state.currentStep === "complete" ? (
      <div
        className={
          embedded
            ? "shrink-0 border-t border-foreground/[0.06] bg-background px-4 py-5 sm:px-6"
            : "mt-8"
        }
      >
        <div className={embedded ? "mx-auto w-full max-w-[760px]" : ""}>
          <p className="text-[13px] leading-6 text-foreground/50">
            {state.nextStep ?? "Ready to move on."}
          </p>
          <div className="mt-4">
            <Button
              type="button"
              onClick={handleContinue}
              disabled={finalizeForgeUnit.isPending || preview}
              className="h-9 rounded-none bg-primary px-5 text-[12px] font-medium uppercase tracking-[0.12em] text-primary-foreground before:rounded-none hover:brightness-110"
            >
              {finalizeForgeUnit.isPending ? "..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    ) : null;

  /* ── Embedded mode — messages flow naturally and input grows downward ── */
  if (embedded) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="pb-8">
          {messages}
          <div ref={bottomRef} />
        </div>
        {inputZone && <div className="-mx-6 sm:-mx-8">{inputZone}</div>}
      </div>
    );
  }

  /* ── Standalone mode ── */
  return (
    <main className="bp-page-bg min-h-screen px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="mb-8 flex items-center justify-between border-b border-foreground/[0.06] pb-6">
          <div>
            <h1 className="font-display text-2xl tracking-[-0.03em]">
              {state.title}
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-foreground/50">
              {state.summary}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-9 rounded-none border-foreground/[0.08] bg-transparent px-4 text-[12px] uppercase tracking-[0.12em] text-foreground/70 before:rounded-none hover:bg-foreground/[0.03]"
          >
            <Link href={workspaceHref}>Back</Link>
          </Button>
        </div>
        {messages}
        {inputZone}
      </div>
    </main>
  );
}
