"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowBendUpLeft, ArrowUp } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import { AssistantRichText } from "~/features/becoming/components/assistant-rich-text";
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

const COLLAPSED_COMPOSER_MIN_HEIGHT = 112;
const COLLAPSED_COMPOSER_MAX_HEIGHT = 280;

const getComposerHeightBounds = (element: HTMLTextAreaElement | null) => {
  if (typeof window === "undefined") {
    return {
      minHeight: COLLAPSED_COMPOSER_MIN_HEIGHT,
      maxHeight: COLLAPSED_COMPOSER_MAX_HEIGHT,
    };
  }

  const baseMinHeight = COLLAPSED_COMPOSER_MIN_HEIGHT;
  const baseMaxHeight = COLLAPSED_COMPOSER_MAX_HEIGHT;
  const viewportRatioMax = Math.floor(window.innerHeight * 0.24);
  const viewportCap = Math.min(baseMaxHeight, viewportRatioMax);

  const availableSpaceFromTop = element
    ? Math.floor(window.innerHeight - element.getBoundingClientRect().top - 44)
    : viewportCap;
  const maxHeight = Math.max(
    baseMinHeight,
    Math.min(viewportCap, availableSpaceFromTop),
  );

  return {
    minHeight: baseMinHeight,
    maxHeight,
  };
};

const syncComposerTextareaHeight = ({
  element,
}: {
  element: HTMLTextAreaElement | null;
}) => {
  if (!element) return;

  const { minHeight, maxHeight } = getComposerHeightBounds(element);
  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeight,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
};

function MessageBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-4 font-sans">
      <div
        role="heading"
        aria-level={3}
        className="text-foreground/92 text-[15px] font-medium tracking-[-0.02em]"
      >
        <AssistantRichText content={title} />
      </div>
      <div className="text-foreground/88 mt-3 space-y-3 text-[14px] leading-[1.42] tracking-[-0.01em] [&_em]:italic [&_p]:m-0 [&_strong]:font-medium">
        {children}
      </div>
    </section>
  );
}

function PromptTurn({
  prompt,
  helper,
}: {
  prompt: string;
  helper?: string | null;
}) {
  return (
    <section className="py-3 font-sans">
      <div className="max-w-[1720px]">
        <div>
          {helper ? (
            <AssistantRichText
              content={helper}
              className="text-foreground/34 text-[13px] leading-[1.4] tracking-[-0.01em] italic"
            />
          ) : null}
          <AssistantRichText
            content={prompt}
            className={[
              "text-foreground tracking-[-0.035em]",
              helper
                ? "mt-3 text-[16px] leading-[1.32] font-medium"
                : "text-[16px] leading-[1.36] font-medium",
            ].join(" ")}
          />
        </div>
      </div>
    </section>
  );
}

function UserResponse({ text }: { text: string }) {
  return (
    <div className="py-5 font-sans">
      <div className="max-w-[78%] rounded-[16px] bg-[#eaf1ff] px-5 py-3 text-[14px] leading-[1.4] tracking-[-0.015em] text-[#0a63d8] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
        {text}
      </div>
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
    <div className="border-foreground/[0.08] bg-background/94 rounded-[18px] border px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_30px_rgba(15,23,42,0.05)] sm:px-6">
      <div className="text-foreground/35 text-[12px] font-medium tracking-[-0.01em]">
        No reply needed
      </div>
      <div className="text-foreground mt-2.5 text-[15px] font-medium tracking-[-0.02em]">
        {title}
      </div>
      <p className="text-foreground/58 mt-2 max-w-[82ch] text-[13px] leading-6 tracking-[-0.01em]">
        {description}
      </p>
      <div className="mt-4">
        <Button
          type="button"
          onClick={onPrimaryAction}
          className="border-foreground/[0.08] bg-foreground text-background hover:bg-foreground/92 h-9 rounded-xl px-4 text-[13px] font-medium tracking-[-0.02em] before:rounded-[11px]"
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
  const [responseMode, setResponseMode] = useState<
    "free_response" | "multiple_choice"
  >(state.challenge.responseMode);
  const [openedGateKeys, setOpenedGateKeys] = useState<string[]>([]);
  const [stepStartedAt, setStepStartedAt] = useState(() => Date.now());
  const [activeRecallGate, setActiveRecallGate] = useState<RecallGate | null>(
    recallGate,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

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
    setTimeout(
      () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  }, [
    activePromptCard?.prompt,
    activePromptCard?.responseMode,
    state.activeStage,
    state.retryCount,
  ]);

  useLayoutEffect(() => {
    syncComposerTextareaHeight({
      element: composerTextareaRef.current,
    });
  }, [response, state.activeStage, activePromptCard?.prompt]);

  useEffect(() => {
    const handleResize = () =>
      syncComposerTextareaHeight({
        element: composerTextareaRef.current,
      });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    setTimeout(
      () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
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
      <PromptTurn
        key="challenge"
        prompt={state.challenge.prompt}
        helper={state.challenge.helper}
      />,
    );

    if (state.initialResponse?.response) {
      messages.push(
        <UserResponse
          key="initial-response"
          text={state.initialResponse.response}
        />,
      );
    }

    if (state.conceptCorrection) {
      messages.push(
        <MessageBox
          key="concept-correction"
          title={state.conceptCorrection.name}
        >
          {state.diagnosticGap ? (
            <div className="space-y-3">
              <AssistantRichText content={state.conceptCorrection.summary} />
              <div className="border-foreground/[0.08] text-foreground/58 border-l-2 pl-4 text-[13px] leading-6">
                <AssistantRichText
                  content={state.diagnosticGap.predictionError}
                />
                <div className="mt-2">
                  <span>What held up: </span>
                  <AssistantRichText
                    content={state.diagnosticGap.whatHeldUp}
                    className="inline-block"
                  />
                </div>
                <div className="mt-1">
                  <span>What broke: </span>
                  <AssistantRichText
                    content={state.diagnosticGap.whatBroke}
                    className="inline-block"
                  />
                </div>
              </div>
            </div>
          ) : (
            <AssistantRichText content={state.conceptCorrection.summary} />
          )}

          {state.workedExamples.length > 0 && (
            <div className="mt-6 space-y-4">
              {state.workedExamples.map((example) => (
                <div key={`${example.label}-${example.content.slice(0, 24)}`}>
                  <div className="text-foreground/40 text-[13px] font-medium tracking-[-0.01em]">
                    {example.label}
                  </div>
                  <AssistantRichText
                    content={example.content}
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
          )}

          {state.priorKnowledgeBridge && (
            <AssistantRichText
              content={state.priorKnowledgeBridge}
              className="border-foreground/[0.08] text-foreground/54 mt-6 border-l-2 pl-4 text-[13px] leading-6"
            />
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
          <AssistantRichText content={state.assessmentFeedback} />
        </MessageBox>,
      );
    }

    if (
      state.masteryCheck &&
      state.activeStage === "mastery_check" &&
      interactionMode.kind === "compose"
    ) {
      messages.push(
        <PromptTurn
          key="mastery-check"
          prompt={state.masteryCheck.prompt}
          helper={state.masteryCheck.helper}
        />,
      );
    }

    if (
      shouldShowTransferChallenge(state) &&
      state.transferChallenge &&
      state.revisedBuildResponse == null
    ) {
      messages.push(
        <PromptTurn
          key="transfer-challenge"
          prompt={state.transferChallenge.prompt}
          helper={state.transferChallenge.helper}
        />,
      );
    }

    if (state.buildResponse?.response) {
      messages.push(
        <UserResponse
          key="build-response"
          text={state.buildResponse.response}
        />,
      );
    }

    if (state.implementationReview) {
      messages.push(
        <MessageBox key="implementation-review" title="Implementation review">
          <AssistantRichText content={state.implementationReview.summary} />
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-foreground/40 text-[13px] font-medium tracking-[-0.01em]">
                Strongest parts
              </div>
              <div className="text-foreground/58 mt-2 space-y-1.5 text-[13px] leading-6">
                {state.implementationReview.strengths.map((item) => (
                  <div key={item} className="flex gap-2">
                    <span>-</span>
                    <AssistantRichText
                      content={item}
                      className="min-w-0 flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-foreground/40 text-[13px] font-medium tracking-[-0.01em]">
                Tighten next
              </div>
              <div className="text-foreground/58 mt-2 space-y-1.5 text-[13px] leading-6">
                {state.implementationReview.improvements.map((item) => (
                  <div key={item} className="flex gap-2">
                    <span>-</span>
                    <AssistantRichText
                      content={item}
                      className="min-w-0 flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <AssistantRichText
            content={`Revision brief: ${state.implementationReview.requiredRevision}`}
            className="border-foreground/[0.08] text-foreground/50 mt-6 border-l-2 pl-4 text-[14px]"
          />
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
          <AssistantRichText content={state.assessmentFeedback} />
        </MessageBox>,
      );
    }

    if (
      shouldShowTransferChallenge(state) &&
      state.transferChallenge &&
      state.revisedBuildResponse != null
    ) {
      messages.push(
        <PromptTurn
          key="retry-transfer-challenge"
          prompt={state.transferChallenge.prompt}
          helper={state.transferChallenge.helper}
        />,
      );
    }

    if (state.activeStage === "complete" && state.assessmentFeedback) {
      messages.push(
        <MessageBox key="final-assessment" title="Final assessment">
          <AssistantRichText content={state.assessmentFeedback} />
          {(state.strengths.length > 0 || state.improvements.length > 0) && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {state.strengths.length > 0 && (
                <div>
                  <div className="text-foreground/40 text-[13px] font-medium tracking-[-0.01em]">
                    What worked
                  </div>
                  <div className="text-foreground/58 mt-2 space-y-1.5 text-[13px] leading-6">
                    {state.strengths.map((item) => (
                      <div key={item} className="flex gap-2">
                        <span>-</span>
                        <AssistantRichText
                          content={item}
                          className="min-w-0 flex-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {state.improvements.length > 0 && (
                <div>
                  <div className="text-foreground/40 text-[13px] font-medium tracking-[-0.01em]">
                    What to keep sharpening
                  </div>
                  <div className="text-foreground/58 mt-2 space-y-1.5 text-[13px] leading-6">
                    {state.improvements.map((item) => (
                      <div key={item} className="flex gap-2">
                        <span>-</span>
                        <AssistantRichText
                          content={item}
                          className="min-w-0 flex-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {state.score != null && (
            <div className="text-foreground/34 mt-6 font-mono text-[13px]">
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
          embedded ? "bg-background shrink-0 px-4 pt-4 pb-6 sm:px-8" : "mt-10"
        }
      >
        <div className={embedded ? "mx-auto w-full max-w-[1820px]" : ""}>
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
                  disabled={
                    !canSubmit || submitEducationUnitStep.isPending || preview
                  }
                  aria-label="Submit response"
                  className="border-primary bg-primary text-primary-foreground inline-flex h-8 w-8 items-center justify-center border transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowUp size={14} weight="bold" />
                </button>
              </div>
            </div>
          ) : (
            <div className="font-sans">
              <div className="border-foreground/[0.08] bg-card focus-within:border-foreground/18 rounded-[10px] border shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_18px_-12px_rgba(0,0,0,0.14)] transition-[border-color,box-shadow] duration-150">
                <div className="relative">
                  <textarea
                    ref={composerTextareaRef}
                    value={response}
                    onChange={(event) => setResponse(event.target.value)}
                    onInput={(event) =>
                      syncComposerTextareaHeight({
                        element: event.currentTarget,
                      })
                    }
                    placeholder={getPlaceholder(state)}
                    rows={1}
                    className="text-foreground/92 placeholder:text-foreground/30 block w-full resize-none bg-transparent px-3.5 pt-3 pb-10 text-[14px] leading-[1.5] tracking-[-0.005em] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={
                      !canSubmit || submitEducationUnitStep.isPending || preview
                    }
                    aria-label="Submit response"
                    className="text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/82 absolute right-2 bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ArrowBendUpLeft size={16} />
                  </button>
                </div>
              </div>
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
                className="border-foreground/[0.08] text-foreground/25 hover:bg-foreground/[0.03] hover:text-foreground/40 border px-2 py-1 text-[10px] font-medium tracking-[0.16em] uppercase transition-colors"
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
            ? "border-foreground/[0.06] bg-background shrink-0 border-t px-4 py-5 sm:px-6"
            : "mt-8"
        }
      >
        <div className={embedded ? "mx-auto w-full max-w-[1820px]" : ""}>
          <div className="text-foreground/50 text-[14px] leading-6 tracking-[-0.015em]">
            <AssistantRichText
              content={state.nextStep ?? "Ready to move on."}
            />
          </div>
          <div className="mt-4">
            <Button
              type="button"
              onClick={handleContinue}
              disabled={finalizeForgeUnit.isPending || preview}
              className="bg-foreground text-background hover:bg-foreground/92 h-9 rounded-xl px-5 text-[13px] font-medium tracking-[-0.02em] before:rounded-[11px]"
            >
              {finalizeForgeUnit.isPending ? "..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    ) : null;

  if (embedded) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <div className="flex-1 pt-6 pb-8">
          {messages}
          <div ref={bottomRef} />
        </div>
        {inputZone && (
          <div className="-mx-6 mt-auto sm:-mx-10">{inputZone}</div>
        )}
      </div>
    );
  }

  return (
    <main className="bp-page-bg text-foreground min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="border-foreground/[0.06] mb-8 flex items-center justify-between border-b pb-6">
          <div>
            <div
              role="heading"
              aria-level={1}
              className="font-display text-2xl tracking-[-0.03em]"
            >
              <AssistantRichText content={state.title} />
            </div>
            <AssistantRichText
              content={state.summary}
              className="text-foreground/50 mt-2 text-[14px] leading-relaxed"
            />
          </div>
          <Button
            asChild
            variant="outline"
            className="border-foreground/[0.08] text-foreground/70 hover:bg-foreground/[0.03] h-9 rounded-none bg-transparent px-4 text-[12px] tracking-[0.12em] uppercase before:rounded-none"
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
