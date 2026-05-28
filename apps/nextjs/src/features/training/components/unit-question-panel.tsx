"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowsIn,
  ArrowsOut,
  ArrowUp,
  X,
} from "@phosphor-icons/react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { AssistantRichText } from "./assistant-rich-text";

type EducationUnit = RouterOutputs["training"]["unit"];

interface PanelMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

const ASK_COMPOSER_MIN_HEIGHT = 112;
const ASK_COMPOSER_MAX_HEIGHT = 280;

const getAskComposerBounds = (element: HTMLTextAreaElement | null) => {
  if (typeof window === "undefined") {
    return {
      minHeight: ASK_COMPOSER_MIN_HEIGHT,
      maxHeight: ASK_COMPOSER_MAX_HEIGHT,
    };
  }

  const viewportRatioMax = Math.floor(window.innerHeight * 0.26);
  const viewportCap = Math.min(ASK_COMPOSER_MAX_HEIGHT, viewportRatioMax);
  const availableSpaceFromTop = element
    ? Math.floor(window.innerHeight - element.getBoundingClientRect().top - 52)
    : viewportCap;
  const maxHeight = Math.max(
    ASK_COMPOSER_MIN_HEIGHT,
    Math.min(viewportCap, availableSpaceFromTop),
  );

  return {
    minHeight: ASK_COMPOSER_MIN_HEIGHT,
    maxHeight,
  };
};

const syncAskComposerHeight = (element: HTMLTextAreaElement | null) => {
  if (!element) return;

  const { minHeight, maxHeight } = getAskComposerBounds(element);
  element.style.height = "0px";
  const nextHeight = Math.max(
    minHeight,
    Math.min(element.scrollHeight, maxHeight),
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
};

function buildUnitAnswer(unit: EducationUnit, question: string) {
  const lower = question.toLowerCase();
  const activeCard =
    unit.activeStage === "challenge"
      ? unit.challenge
      : unit.activeStage === "mastery_check"
        ? unit.masteryCheck
        : unit.activeStage === "transfer_challenge"
          ? unit.transferChallenge
          : null;
  const helper =
    (unit.activeStage === "revision"
      ? unit.implementationReview?.requiredRevision
      : activeCard?.helper) ??
    unit.priorKnowledgeBridge ??
    unit.summary;
  const conceptName = unit.conceptCorrection?.name;
  const conceptSummary = unit.conceptCorrection?.summary;

  if (
    lower.includes("what is this asking") ||
    lower.includes("what am i supposed") ||
    lower.includes("what should i do")
  ) {
    return [
      unit.activeStage === "revision"
        ? `The task is asking you to revise your build against this brief: "${unit.implementationReview?.requiredRevision ?? unit.title}".`
        : `The task is asking you to respond to "${activeCard?.title ?? unit.title}" with a concrete judgment, not a generic recap.`,
      helper
        ? `Use this constraint: ${helper}`
        : "Anchor your answer in the scenario, identify the key signal, then state the decision you would make next.",
    ].join("\n\n");
  }

  if (
    lower.includes("how do i start") ||
    lower.includes("where do i start") ||
    lower.includes("i'm stuck")
  ) {
    return [
      "Start with the first decision, not the full essay.",
      unit.activeStage === "revision"
        ? `Your first move is to address this revision brief directly: ${unit.implementationReview?.requiredRevision ?? unit.title}`
        : activeCard?.prompt
          ? `The live tension you need to answer is: ${activeCard.prompt}`
          : "Name the signal you see, state the decision it implies, and only then justify it.",
      helper ? `Keep this in view: ${helper}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (
    lower.includes("concept") ||
    lower.includes("principle") ||
    lower.includes("lesson") ||
    lower.includes("idea")
  ) {
    return [
      conceptName
        ? `The concept being trained here is ${conceptName}.`
        : `The unit is training ${unit.title}.`,
      conceptSummary ??
        "The point is to build a reusable decision pattern under pressure, not just repeat a definition.",
      unit.priorKnowledgeBridge
        ? `Tie-back: ${unit.priorKnowledgeBridge}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (
    lower.includes("good answer") ||
    lower.includes("strong answer") ||
    lower.includes("what makes")
  ) {
    return [
      "A strong answer is specific, directional, and tied to the actual constraints in the prompt.",
      "It should identify the key signal, choose a move, and explain the tradeoff behind that move.",
      helper ? `Avoid drifting past this constraint: ${helper}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `This question sits inside "${unit.title}".`,
    activeCard?.title
      ? `Right now the live focus is "${activeCard.title}", so aim your answer at what would move that step forward.`
      : "Use the active prompt as the anchor for your reasoning.",
    helper
      ? `Fast guidance: ${helper}`
      : "Keep the response concrete, scenario-bound, and decision-shaped.",
  ].join("\n\n");
}

export function UnitQuestionPanel({
  unit,
  isFocused,
  onClose,
  onToggleFocus,
  onReturnToUnit,
}: {
  unit: EducationUnit;
  isFocused: boolean;
  onClose: () => void;
  onToggleFocus: () => void;
  onReturnToUnit: () => void;
}) {
  const activeCard =
    unit.activeStage === "challenge"
      ? unit.challenge
      : unit.activeStage === "mastery_check"
        ? unit.masteryCheck
        : unit.activeStage === "transfer_challenge"
          ? unit.transferChallenge
          : null;

  const initialAssistantMessage = useMemo<PanelMessage>(
    () => ({
      id: "intro",
      role: "assistant",
      content: [
        `Ask about "${unit.title}" and I’ll answer against the live unit context.`,
        unit.activeStage === "revision"
          ? `Current focus: revise against "${unit.implementationReview?.requiredRevision ?? unit.title}"`
          : `Current prompt: ${activeCard?.title ?? unit.title}`,
      ].join("\n\n"),
    }),
    [activeCard?.title, unit],
  );

  const [messages, setMessages] = useState<PanelMessage[]>([
    initialAssistantMessage,
  ]);
  const [question, setQuestion] = useState("");
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset panel history when the active unit changes.
    setMessages([initialAssistantMessage]);
  }, [initialAssistantMessage]);

  useLayoutEffect(() => {
    syncAskComposerHeight(composerTextareaRef.current);
  }, [question, unit.activeStage, initialAssistantMessage]);

  useEffect(() => {
    const handleResize = () =>
      syncAskComposerHeight(composerTextareaRef.current);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const canSubmit = question.trim().length > 0;

  const handleAsk = () => {
    if (!canSubmit) return;

    const trimmed = question.trim();
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      },
      {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        content: buildUnitAnswer(unit, trimmed),
      },
    ]);
    setQuestion("");
  };

  return (
    <aside className="border-foreground/[0.06] bg-sidebar text-foreground flex h-full min-w-0 flex-col border-l">
      <div className="border-foreground/[0.06] flex h-14 items-center justify-between border-b px-4">
        <div className="min-w-0">
          <div className="text-foreground/80 truncate text-[13px]">
            Unit help
          </div>
          <div className="text-foreground/34 truncate text-[11px]">
            {unit.title}
          </div>
        </div>
        <div className="flex items-center">
          {isFocused && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReturnToUnit}
              className="text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground mr-1 rounded-none border-0 px-2 text-[12px] before:rounded-none"
            >
              <ArrowLeft size={14} />
              Return
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleFocus}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-none border-0 before:rounded-none"
            aria-label={
              isFocused ? "Shrink question panel" : "Focus question panel"
            }
          >
            {isFocused ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground rounded-none border-0 before:rounded-none"
            aria-label="Close question panel"
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-6">
          {messages.map((message) =>
            message.role === "assistant" ? (
              <div
                key={message.id}
                className="text-foreground/82 text-[14px] leading-[1.6]"
              >
                <AssistantRichText content={message.content} />
              </div>
            ) : (
              <div key={message.id} className="flex justify-end">
                <div className="bg-primary/[0.08] text-primary/90 max-w-[82%] rounded-[14px] px-3.5 py-2 text-[14px] leading-[1.55] whitespace-pre-wrap">
                  {message.content}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="border-foreground/[0.08] bg-card focus-within:border-foreground/18 relative rounded-[10px] border shadow-[0_1px_0_rgba(0,0,0,0.02),0_4px_18px_-12px_rgba(0,0,0,0.14)] transition-[border-color,box-shadow] duration-150">
          <textarea
            ref={composerTextareaRef}
            aria-label="Ask a question about this unit"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onInput={(event) => syncAskComposerHeight(event.currentTarget)}
            placeholder="Ask what the unit is really testing, how to start, or what a strong answer should do."
            rows={1}
            className="text-foreground placeholder:text-foreground/30 block min-h-[112px] w-full resize-none bg-transparent px-3.5 pt-3 pb-10 text-[13.5px] leading-[1.55] tracking-[-0.005em] outline-none"
          />
          <Button
            type="button"
            onClick={handleAsk}
            disabled={!canSubmit}
            variant="ghost"
            size="icon"
            className="bg-primary text-primary-foreground hover:bg-primary/90 absolute right-2 bottom-2 size-7 rounded-md border-0 p-0 before:rounded-md"
            aria-label="Ask question"
          >
            <ArrowUp size={13} weight="bold" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
