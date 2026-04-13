"use client";

import {
  ArrowLeft,
  ArrowUp,
  ArrowsIn,
  ArrowsOut,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { Textarea } from "@acme/ui/textarea";

type EducationUnit = RouterOutputs["becoming"]["unit"];

type PanelMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
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
      unit.priorKnowledgeBridge ? `Tie-back: ${unit.priorKnowledgeBridge}` : null,
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

  useEffect(() => {
    setMessages([initialAssistantMessage]);
  }, [initialAssistantMessage]);

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
    <aside className="flex h-full min-w-0 flex-col border-l border-foreground/[0.06] bg-sidebar text-foreground">
      <div className="flex h-14 items-center justify-between border-b border-foreground/[0.06] px-4">
        <div className="min-w-0">
          <div className="truncate text-[13px] text-foreground/80">Unit help</div>
          <div className="truncate text-[11px] text-foreground/34">{unit.title}</div>
        </div>
        <div className="flex items-center">
          {isFocused && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReturnToUnit}
              className="mr-1 rounded-none border-0 px-2 text-[12px] text-foreground/60 before:rounded-none hover:bg-foreground/[0.04] hover:text-foreground"
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
            className="rounded-none border-0 text-foreground/55 before:rounded-none hover:bg-foreground/[0.04] hover:text-foreground"
            aria-label={isFocused ? "Shrink question panel" : "Focus question panel"}
          >
            {isFocused ? <ArrowsIn size={15} /> : <ArrowsOut size={15} />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="rounded-none border-0 text-foreground/55 before:rounded-none hover:bg-foreground/[0.04] hover:text-foreground"
            aria-label="Close question panel"
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="space-y-2">
              <div className="text-[11px] text-foreground/32">
                {message.role === "assistant" ? "Guide" : "You"}
              </div>
              <div
                className={[
                  "border px-4 py-3 text-[13px] leading-6 whitespace-pre-wrap",
                  message.role === "assistant"
                    ? "border-foreground/[0.08] bg-card/55 text-foreground/78"
                    : "border-primary/18 bg-primary/[0.09] text-foreground/90",
                ].join(" ")}
              >
                {message.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-foreground/[0.06] px-4 pt-4 pb-4">
        <div className="relative">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask what the unit is really testing, how to start, or what a strong answer should do."
            className="min-h-[132px] rounded-none border-border bg-input text-[13px] leading-6 text-foreground placeholder:text-foreground/24 before:rounded-none focus-visible:border-foreground/16 focus-visible:ring-0 [&_[data-slot=textarea]]:resize-none [&_[data-slot=textarea]]:px-4 [&_[data-slot=textarea]]:pt-4 [&_[data-slot=textarea]]:pb-12"
          />
          <Button
            type="button"
            onClick={handleAsk}
            disabled={!canSubmit}
            variant="ghost"
            size="icon"
            className="absolute right-3 bottom-3 h-8 w-8 rounded-none border border-primary bg-primary p-0 text-primary-foreground before:rounded-none hover:bg-primary/90"
            aria-label="Ask question"
          >
            <ArrowUp size={14} weight="bold" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
