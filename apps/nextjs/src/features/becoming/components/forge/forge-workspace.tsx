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

import { RecallGateView } from "~/features/becoming/components/recall/RecallGateView";
import { useTRPC } from "~/trpc/react";

type EducationUnit = RouterOutputs["becoming"]["unit"];
type RecallGate = RouterOutputs["becoming"]["getRecallGate"];
type FinalizeForgeUnitResult = RouterOutputs["becoming"]["finalizeForgeUnit"];
type SubmitRecallProbeResult = RouterOutputs["becoming"]["submitRecallProbe"];

type LoopSubmitStep =
  | "initial_response"
  | "mastery_check"
  | "build_response"
  | "revision";

type InteractionMode =
  | {
      kind: "acknowledge";
      title: string;
      description: string;
      primaryLabel: string;
    }
  | { kind: "compose" };

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

function UserResponse({ text }: { text: string }) {
  return (
    <div className="min-h-[20vh] flex items-center">
      <p className="text-[13px] leading-7 text-foreground/60">{text}</p>
    </div>
  );
}

function ActionGate({
  title,
  description,
  primaryLabel,
  onPrimaryAction,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimaryAction: () => void;
}) {
  return (
    <div className="border border-foreground/[0.08] bg-card/55 px-4 py-4 sm:px-5">
      <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/32">
        No reply needed
      </div>
      <div className="mt-3 text-[15px] font-medium tracking-[-0.02em] text-foreground">
        {title}
      </div>
      <p className="mt-2 max-w-[54ch] text-[13px] leading-6 text-foreground/58">
        {description}
      </p>
      <div className="mt-4">
        <Button
          type="button"
          onClick={onPrimaryAction}
          className="h-9 rounded-none bg-primary px-4 text-[12px] font-medium uppercase tracking-[0.12em] text-primary-foreground before:rounded-none hover:brightness-110"
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}

const getActivePromptCard = (state: EducationUnit) => {
  switch (state.activeStage) {
    case "challenge":
      return state.challenge;
    case "mastery_check":
      return state.masteryCheck;
    case "transfer_challenge":
      return state.transferChallenge;
    default:
      return null;
  }
};

const getSubmissionStep = (state: EducationUnit): LoopSubmitStep | null => {
  switch (state.activeStage) {
    case "challenge":
      return "initial_response";
    case "mastery_check":
      return "mastery_check";
    case "transfer_challenge":
      return "build_response";
    case "revision":
      return "revision";
    default:
      return null;
  }
};

const getPlaceholder = (state: EducationUnit) => {
  switch (state.activeStage) {
    case "challenge":
      return "Give your first-pass read. Stay concise and commit to a mechanism.";
    case "mastery_check":
      return "Answer the concept check directly. Precision matters more than length.";
    case "transfer_challenge":
      return "Name the components, sequence, constraints, failure cases, and verification plan.";
    case "revision":
      return "Revise the build plan by directly addressing the implementation review.";
    default:
      return "";
  }
};

const shouldShowTransferChallenge = (state: EducationUnit) =>
  state.transferChallenge != null &&
  (state.activeStage === "transfer_challenge" ||
    state.activeStage === "revision" ||
    state.activeStage === "complete" ||
    state.buildResponse != null ||
    state.implementationReview != null ||
    state.revisedBuildResponse != null);

const getInstructionGateKey = (state: EducationUnit) => {
  if (state.activeStage === "mastery_check" && state.masteryCheck) {
    return `mastery:${state.retryCount}:${state.masteryCheck.title}:${state.masteryCheck.prompt}`;
  }

  if (state.activeStage === "revision" && state.implementationReview) {
    return `revision:${state.retryCount}:${state.implementationReview.requiredRevision}`;
  }

  return null;
};

const getInteractionMode = ({
  state,
  gateLocked,
}: {
  state: EducationUnit;
  gateLocked: boolean;
}): InteractionMode => {
  if (gateLocked && state.activeStage === "mastery_check") {
    return {
      kind: "acknowledge",
      title: "Ready for the quick check?",
      description:
        state.assessmentStatus === "retry_concept"
          ? "You do not need to type a filler reply here. Read the correction, then start the next concept check when you are ready."
          : "You do not need to reply to the teaching turn. Start the quick check when you are ready to answer.",
      primaryLabel: "Start quick check",
    };
  }

  if (gateLocked && state.activeStage === "revision") {
    return {
      kind: "acknowledge",
      title: "Ready to revise?",
      description:
        "The review above is instruction, not evidence. Start the revision when you are ready to answer the brief directly.",
      primaryLabel: "Revise now",
    };
  }

  return { kind: "compose" };
};

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
  const [responseMode, setResponseMode] = useState<"free_response" | "multiple_choice">(
    state.challenge.responseMode,
  );
  const [openedGateKeys, setOpenedGateKeys] = useState<string[]>([]);
  const [stepStartedAt, setStepStartedAt] = useState(() => Date.now());
  const [activeRecallGate, setActiveRecallGate] = useState<RecallGate | null>(
    recallGate,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const workspaceHref = preview ? "/ui/home" : `/home?session=${sessionId}`;
  const activePromptCard = getActivePromptCard(state);
  const submissionStep = getSubmissionStep(state);
  const canSubmit = response.trim().length > 0;
  const instructionGateKey = getInstructionGateKey(state);
  const gateLocked =
    instructionGateKey != null && !openedGateKeys.includes(instructionGateKey);
  const interactionMode = getInteractionMode({
    state,
    gateLocked,
  });
  const confidence =
    state.revisedBuildResponse?.confidence ??
    state.buildResponse?.confidence ??
    state.masteryCheckResponse?.confidence ??
    state.initialResponse?.confidence ??
    "medium";

  useEffect(() => {
    setResponse("");
    setResponseMode(activePromptCard?.responseMode ?? "free_response");
    setStepStartedAt(Date.now());
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [activePromptCard?.prompt, activePromptCard?.responseMode, state.activeStage, state.retryCount]);

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
    if (!submissionStep || preview) {
      return;
    }

    const nextState = await submitEducationUnitStep.mutateAsync({
      nodeId: state.nodeId,
      sessionId,
      step: submissionStep,
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
    router.push(`/home?session=${sessionId}`);
    router.refresh();
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

  const handleOpenInstructionGate = () => {
    if (!instructionGateKey) {
      return;
    }

    setOpenedGateKeys((prev) =>
      prev.includes(instructionGateKey) ? prev : [...prev, instructionGateKey],
    );
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const modeOptions = useMemo(
    () =>
      (activePromptCard?.options ?? []).map((option) => ({
        id: option.id,
        label: option.label,
      })),
    [activePromptCard?.options],
  );

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
    messages.push(
      <MessageBox key="challenge" title={state.challenge.title}>
        <p>{state.challenge.prompt}</p>
        {state.challenge.helper && (
          <p className="mt-4 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
            {state.challenge.helper}
          </p>
        )}
      </MessageBox>,
    );

    if (state.initialResponse?.response) {
      messages.push(
        <UserResponse key="initial-response" text={state.initialResponse.response} />,
      );
    }

    if (state.conceptCorrection) {
      messages.push(
        <MessageBox key="concept-correction" title={state.conceptCorrection.name}>
          {state.diagnosticGap ? (
            <div className="space-y-3">
              <p>{state.conceptCorrection.summary}</p>
              <div className="border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/60">
                <div>{state.diagnosticGap.predictionError}</div>
                <div className="mt-2">What held up: {state.diagnosticGap.whatHeldUp}</div>
                <div className="mt-1">What broke: {state.diagnosticGap.whatBroke}</div>
              </div>
            </div>
          ) : (
            <p>{state.conceptCorrection.summary}</p>
          )}

          {state.workedExamples.length > 0 && (
            <div className="mt-6 space-y-4">
              {state.workedExamples.map((example) => (
                <div key={`${example.label}-${example.content.slice(0, 24)}`}>
                  <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/35">
                    {example.label}
                  </div>
                  <p className="mt-2">{example.content}</p>
                </div>
              ))}
            </div>
          )}

          {state.priorKnowledgeBridge && (
            <p className="mt-6 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.priorKnowledgeBridge}
            </p>
          )}
        </MessageBox>,
      );
    }

    if (state.masteryCheckResponse?.response) {
      messages.push(
        <UserResponse
          key="mastery-response"
          text={state.masteryCheckResponse.response}
        />,
      );
    }

    if (
      state.assessmentFeedback &&
      state.activeStage !== "complete" &&
      state.revisedBuildResponse == null &&
      (state.assessmentStatus === "retry_concept" ||
        state.assessmentStatus === "retry_application")
    ) {
      messages.push(
        <MessageBox
          key="assessment-feedback"
          title={
            state.assessmentStatus === "retry_concept"
              ? "Concept needs tightening"
              : state.assessmentStatus === "retry_application"
                ? "Execution needs tightening"
                : "Progress update"
          }
        >
          <p>{state.assessmentFeedback}</p>
        </MessageBox>,
      );
    }

    if (
      state.masteryCheck &&
      state.activeStage === "mastery_check" &&
      interactionMode.kind === "compose"
    ) {
      messages.push(
        <MessageBox key="mastery-check" title={state.masteryCheck.title}>
          <p>{state.masteryCheck.prompt}</p>
          {state.masteryCheck.helper && (
            <p className="mt-4 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.masteryCheck.helper}
            </p>
          )}
        </MessageBox>,
      );
    }

    if (
      shouldShowTransferChallenge(state) &&
      state.transferChallenge &&
      state.revisedBuildResponse == null
    ) {
      messages.push(
        <MessageBox key="transfer-challenge" title={state.transferChallenge.title}>
          <p>{state.transferChallenge.prompt}</p>
          {state.transferChallenge.helper && (
            <p className="mt-4 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.transferChallenge.helper}
            </p>
          )}
        </MessageBox>,
      );
    }

    if (state.buildResponse?.response) {
      messages.push(
        <UserResponse key="build-response" text={state.buildResponse.response} />,
      );
    }

    if (state.implementationReview) {
      messages.push(
        <MessageBox key="implementation-review" title="Implementation review">
          <p>{state.implementationReview.summary}</p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-[12px] font-medium text-foreground/35">
                Strongest parts
              </div>
              <div className="mt-2 space-y-1.5 text-[14px] text-foreground/60">
                {state.implementationReview.strengths.map((item) => (
                  <div key={item}>- {item}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-foreground/35">
                Tighten next
              </div>
              <div className="mt-2 space-y-1.5 text-[14px] text-foreground/60">
                {state.implementationReview.improvements.map((item) => (
                  <div key={item}>- {item}</div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-6 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
            Revision brief: {state.implementationReview.requiredRevision}
          </p>
        </MessageBox>,
      );
    }

    if (state.revisedBuildResponse?.response) {
      messages.push(
        <UserResponse
          key="revised-build-response"
          text={state.revisedBuildResponse.response}
        />,
      );
    }

    if (
      state.assessmentFeedback &&
      state.activeStage !== "complete" &&
      state.revisedBuildResponse != null &&
      (state.assessmentStatus === "retry_concept" ||
        state.assessmentStatus === "retry_application")
    ) {
      messages.push(
        <MessageBox
          key="post-revision-feedback"
          title={
            state.assessmentStatus === "retry_concept"
              ? "Concept needs tightening"
              : "Execution needs tightening"
          }
        >
          <p>{state.assessmentFeedback}</p>
        </MessageBox>,
      );
    }

    if (
      shouldShowTransferChallenge(state) &&
      state.transferChallenge &&
      state.revisedBuildResponse != null
    ) {
      messages.push(
        <MessageBox key="retry-transfer-challenge" title={state.transferChallenge.title}>
          <p>{state.transferChallenge.prompt}</p>
          {state.transferChallenge.helper && (
            <p className="mt-4 border-l-2 border-foreground/[0.08] pl-4 text-[14px] text-foreground/50">
              {state.transferChallenge.helper}
            </p>
          )}
        </MessageBox>,
      );
    }

    if (state.activeStage === "complete" && state.assessmentFeedback) {
      messages.push(
        <MessageBox key="final-assessment" title="Final assessment">
          <p>{state.assessmentFeedback}</p>
          {(state.strengths.length > 0 || state.improvements.length > 0) && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {state.strengths.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-foreground/35">
                    What worked
                  </div>
                  <div className="mt-2 space-y-1.5 text-[14px] text-foreground/60">
                    {state.strengths.map((item) => (
                      <div key={item}>- {item}</div>
                    ))}
                  </div>
                </div>
              )}
              {state.improvements.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-foreground/35">
                    What to keep sharpening
                  </div>
                  <div className="mt-2 space-y-1.5 text-[14px] text-foreground/60">
                    {state.improvements.map((item) => (
                      <div key={item}>- {item}</div>
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

  const inputZone =
    !activeRecallGate && state.activeStage !== "complete" ? (
      <div
        className={
          embedded
            ? "shrink-0 border-t border-foreground/[0.06] bg-background px-4 pt-10 pb-7 sm:px-6 sm:pt-11"
            : "mt-10"
        }
      >
        <div className={embedded ? "mx-auto w-full max-w-[760px]" : ""}>
          {interactionMode.kind === "acknowledge" ? (
            <ActionGate
              title={interactionMode.title}
              description={interactionMode.description}
              primaryLabel={interactionMode.primaryLabel}
              onPrimaryAction={handleOpenInstructionGate}
            />
          ) : responseMode === "multiple_choice" && modeOptions.length > 0 ? (
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
                  disabled={!canSubmit || submitEducationUnitStep.isPending || preview}
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
                placeholder={getPlaceholder(state)}
                className="min-h-[140px] rounded-none border-border bg-input text-[13px] leading-6 text-foreground placeholder:text-foreground/25 before:rounded-none shadow-none focus-visible:border-foreground/15 focus-visible:ring-0 [&_[data-slot=textarea]]:resize-none [&_[data-slot=textarea]]:px-4 [&_[data-slot=textarea]]:pt-4 [&_[data-slot=textarea]]:pb-14"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || submitEducationUnitStep.isPending || preview}
                aria-label="Submit response"
                className="absolute right-3 bottom-3 inline-flex h-8 w-8 items-center justify-center border border-primary bg-primary text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
              >
                <ArrowUp size={14} weight="bold" />
              </button>
            </div>
          )}

          {interactionMode.kind === "compose" && modeOptions.length > 0 && (
            <div className="mt-4 flex items-center">
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
          )}
        </div>
      </div>
    ) : state.activeStage === "complete" ? (
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
