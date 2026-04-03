"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";
import { RecallGateView } from "~/features/becoming/components/recall/RecallGateView";

import { ClusterBriefingCard } from "./cluster-briefing-card";

type EducationUnit = RouterOutputs["becoming"]["unit"];
type RecallGate = RouterOutputs["becoming"]["getRecallGate"];
type FinalizeForgeUnitResult = RouterOutputs["becoming"]["finalizeForgeUnit"];
type SubmitRecallProbeResult = RouterOutputs["becoming"]["submitRecallProbe"];

export function ForgeWorkspace({
  unit,
  sessionId,
  preview = false,
  recallGate = null,
  embedded = false,
  onNavigate,
}: {
  unit: EducationUnit;
  sessionId: string;
  preview?: boolean;
  recallGate?: RecallGate | null;
  embedded?: boolean;
  onNavigate?: (result: FinalizeForgeUnitResult | SubmitRecallProbeResult["nextAction"]) => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [state, setState] = useState(unit);
  const [response, setResponse] = useState("");
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">(
    state.attempt?.confidence ?? "medium",
  );
  const [responseMode, setResponseMode] = useState<
    "free_response" | "multiple_choice"
  >(state.scenario.responseMode);
  const [stepStartedAt, setStepStartedAt] = useState(() => Date.now());
  const [activeRecallGate, setActiveRecallGate] = useState<RecallGate | null>(
    recallGate,
  );
  const [briefingExpanded, setBriefingExpanded] = useState(true);

  const workspaceHref = preview ? "/ui/home" : `/home?session=${sessionId}`;
  const activeCard =
    state.currentStep === "scenario" ? state.scenario : state.evaluation;
  const canSubmit = response.trim().length > 0;

  useEffect(() => {
    setResponse("");
    setResponseMode(activeCard?.responseMode ?? "free_response");
    setStepStartedAt(Date.now());
  }, [
    activeCard?.prompt,
    activeCard?.responseMode,
    state.currentStep,
    state.loopCount,
  ]);

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
    if (!activeCard || preview) {
      return;
    }

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
    if (!result) {
      return;
    }

    // Always handle recall_gate internally
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
    if (preview) {
      return;
    }

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
    if (!activeRecallGate || preview) {
      return;
    }

    const result = await submitRecallProbe.mutateAsync({
      gateId: activeRecallGate.id,
      probeId,
      mode,
      response: recallResponse,
    });

    setActiveRecallGate(result.gate);
    if (result.nextAction) {
      navigateToNextAction(result.nextAction);
    }
  };

  const modeOptions = useMemo(
    () =>
      (activeCard?.options ?? []).map((option) => ({
        id: option.id,
        label: option.label,
      })),
    [activeCard?.options],
  );

  // ── Content sections (scrollable) ──
  const contentSections = (
    <>
      {activeRecallGate ? (
        <RecallGateView
          gate={activeRecallGate}
          onSubmitProbe={handleRecallProbeSubmit}
          isPending={submitRecallProbe.isPending}
        />
      ) : (
        <>
          {state.clusterBriefing ? (
            <ClusterBriefingCard
              briefing={state.clusterBriefing}
              expanded={briefingExpanded}
              onToggle={() => setBriefingExpanded((current) => !current)}
            />
          ) : null}

          {state.clusterArcFrame ? (
            <section className="border-b border-border/50 pb-6 text-sm leading-7 text-muted-foreground">
              {state.clusterArcFrame}
            </section>
          ) : null}

          {state.concept ? (
            <section className="grid gap-5 border-b border-border/50 pb-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                  Concept
                </div>
                <h2 className="mt-3 font-display text-2xl tracking-[-0.04em]">
                  {state.concept.name}
                </h2>
                <p className="mt-4 text-base leading-8 text-foreground/78">
                  {state.concept.summary}
                </p>
              </div>

              <div>
                <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                  Attempt Signals
                </div>
                <div className="mt-4 space-y-2 text-sm leading-7 text-foreground/72">
                  <div>
                    Band: {state.attempt?.signals?.correctnessBand ?? "pending"}
                  </div>
                  <div>
                    Pattern:{" "}
                    {state.attempt?.signals?.misconceptionDirection ?? "pending"}
                  </div>
                  <div>
                    Style: {state.attempt?.signals?.reasoningStyle ?? "pending"}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {state.teachExamples.length > 0 ? (
            <section className="border-b border-border/50 pb-6">
              <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                Teach
              </div>
              <div className="mt-5 space-y-4">
                {state.teachExamples.map((example) => (
                  <div key={`${example.label}-${example.content.slice(0, 16)}`}>
                    <div className="text-xs uppercase tracking-[0.18em] text-primary/80">
                      {example.label}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-foreground/78">
                      {example.content}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {state.reconnectBridge ? (
            <section className="border-b border-border/50 pb-6">
              <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                Reconnect
              </div>
              <p className="mt-4 text-sm leading-7 text-foreground/78">
                {state.reconnectBridge}
              </p>
            </section>
          ) : null}

          {state.resultFeedback ? (
            <section className="border-b border-border/50 pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                  {state.result ? `Result: ${state.result}` : "Feedback"}
                </div>
                {state.score != null ? (
                  <div className="text-sm text-muted-foreground">
                    Score {state.score}
                  </div>
                ) : null}
              </div>
              <p className="mt-4 text-sm leading-7 text-foreground/78">
                {state.resultFeedback}
              </p>
              {state.strengths.length > 0 || state.improvements.length > 0 ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Strengths
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-7 text-foreground/72">
                      {state.strengths.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Improvements
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-7 text-foreground/72">
                      {state.improvements.map((item) => (
                        <div key={item}>{item}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {state.currentStep !== "complete" && activeCard ? (
            <section>
              <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                {state.currentStep === "scenario" ? "Scenario" : "Evaluate"}
              </div>
              <h2 className="font-display mt-4 text-2xl tracking-[-0.04em]">
                {activeCard.title}
              </h2>
              <p className="mt-4 text-base leading-8 text-foreground/80">
                {activeCard.prompt}
              </p>

              {activeCard.helper ? (
                <div className="mt-4 border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-7 text-foreground/72">
                  {activeCard.helper}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="pt-2">
              <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                Complete
              </div>
              <p className="mt-4 text-sm leading-7 text-foreground/78">
                {state.nextStep ?? "This concept is ready to advance."}
              </p>
              <div className="mt-5">
                <Button
                  type="button"
                  onClick={handleContinue}
                  disabled={finalizeForgeUnit.isPending || preview}
                  className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
                >
                  {finalizeForgeUnit.isPending ? "Continuing..." : "Continue"}
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );

  // ── Input zone (pinned bottom in embedded mode) ──
  const inputZone =
    !activeRecallGate && state.currentStep !== "complete" && activeCard ? (
      <div
        className={
          embedded
            ? "shrink-0 border-t border-border bg-background px-6 py-4 sm:px-10"
            : "mt-6"
        }
      >
        <div className={embedded ? "mx-auto max-w-2xl" : ""}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={responseMode === "free_response" ? "default" : "outline"}
              className="h-9 px-4"
              onClick={() => setResponseMode("free_response")}
            >
              Free Response
            </Button>
            <Button
              type="button"
              variant={
                responseMode === "multiple_choice" ? "default" : "outline"
              }
              className="h-9 px-4"
              onClick={() => setResponseMode("multiple_choice")}
              disabled={modeOptions.length === 0}
            >
              Multiple Choice
            </Button>
          </div>

          {responseMode === "multiple_choice" && modeOptions.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {modeOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={response === option.label ? "default" : "outline"}
                  className="justify-start px-4 py-5 text-left"
                  onClick={() => setResponse(option.label)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : (
            <Textarea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder={
                state.currentStep === "scenario"
                  ? "Write your first read..."
                  : "Apply the concept to this new situation."
              }
              className="mt-4 min-h-[100px] rounded-none border-border bg-transparent px-4 py-4 text-base leading-8 text-foreground shadow-none focus-visible:ring-0"
            />
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {(["low", "medium", "high"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={confidence === option ? "default" : "outline"}
                  className="h-9 px-4 capitalize"
                  onClick={() => setConfidence(option)}
                >
                  {option} confidence
                </Button>
              ))}
            </div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitEducationUnitStep.isPending || preview}
              className="h-11 bg-primary px-6 text-primary-foreground hover:brightness-110"
            >
              {submitEducationUnitStep.isPending
                ? "Working..."
                : state.currentStep === "scenario"
                  ? "Continue"
                  : "Evaluate"}
            </Button>
          </div>
        </div>
      </div>
    ) : null;

  // ── Embedded mode: content flows normally, input sticks to bottom of scroll ──
  if (embedded) {
    return (
      <>
        <div className="flex flex-col gap-6">{contentSections}</div>
        {inputZone && (
          <div className="sticky bottom-0 -mx-6 sm:-mx-10">
            {inputZone}
          </div>
        )}
      </>
    );
  }

  // ── Standalone mode: everything in one scrollable page ──
  return (
    <main className="bp-page-bg min-h-screen px-5 py-8 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div>
            <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
              Education Unit
            </div>
            <h1 className="font-display mt-4 text-3xl tracking-[-0.05em] sm:text-4xl">
              {state.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              {state.summary}
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-11 border-border bg-transparent px-5 text-foreground hover:bg-accent hover:text-foreground"
          >
            <Link href={workspaceHref}>Workspace</Link>
          </Button>
        </div>
        {contentSections}
        {inputZone}
      </div>
    </main>
  );
}
