"use client";

import { useState } from "react";
import {
  CaretRight,
  ChatCircle,
  Copy,
  PencilSimple,
} from "@phosphor-icons/react";

import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";

import type { Exchange } from "./exchange-grouping";
import { AssistantRichText } from "~/features/training/components/assistant-rich-text";
import { countWords, receiptTitle } from "./receipt-summary";

/**
 * A completed exchange collapsed into a one-line receipt: caret, derived
 * title of the assistant turn, and the answer's word count. Expands in place
 * (accordion) to the full prompt + answer with Copy / Revise / Ask-coach
 * actions. Read-only mode (chat history) keeps Copy only.
 */
export function ExchangeReceipt({
  exchange,
  fallbackTitle = "Exchange",
  readOnly = false,
  canRevise = false,
  onRevise,
  onAskCoach,
}: {
  exchange: Exchange;
  fallbackTitle?: string;
  readOnly?: boolean;
  canRevise?: boolean;
  onRevise?: (answer: string) => void;
  onAskCoach?: (answer: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { prompt, answer } = exchange;

  const title = prompt
    ? receiptTitle(prompt.text, fallbackTitle)
    : "Your answer";
  const answerWords = answer ? countWords(answer.text) : 0;
  const rightLabel = answer
    ? `you · ${answerWords} ${answerWords === 1 ? "word" : "words"}`
    : "prompt";

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer.text);
      toast.success("Answer copied.");
    } catch {
      toast.error("Answer could not be copied.");
    }
  };

  return (
    <div className="border-foreground/[0.1] bg-foreground/[0.02] overflow-hidden rounded-md border">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="text-foreground/64 hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.045] flex min-h-9 w-full items-center justify-between gap-4 px-3 text-left text-[12.5px] transition-colors outline-none focus:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CaretRight
            size={12}
            weight="bold"
            className={[
              "shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              isOpen ? "rotate-90" : "",
            ].join(" ")}
          />
          <span className="text-foreground/72 truncate">{title}</span>
        </span>
        <span className="text-foreground/36 shrink-0 text-[11.5px]">
          {rightLabel}
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-foreground/[0.08] border-t">
            {prompt ? (
              <div className="px-3.5 py-3">
                <AssistantRichText
                  content={prompt.text}
                  className="text-foreground/78 text-[13px] leading-6 [&_h2]:text-[14px] [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:!my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:!my-2 [&_ul]:!my-2 [&_ul]:list-disc [&_ul]:pl-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                />
              </div>
            ) : null}

            {answer ? (
              <div
                className={
                  prompt
                    ? "border-foreground/[0.08] border-t px-3.5 py-3"
                    : "px-3.5 py-3"
                }
              >
                <p className="text-foreground/42 mb-1.5 text-[10.5px] font-medium tracking-[0.08em] uppercase">
                  Your answer
                </p>
                <p className="text-foreground/82 text-[13px] leading-6 whitespace-pre-wrap">
                  {answer.text}
                </p>
              </div>
            ) : null}

            {answer ? (
              <div className="border-foreground/[0.08] flex flex-wrap items-center gap-1 border-t px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void copyAnswer()}
                  className="text-foreground/48 hover:text-foreground h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                >
                  <Copy size={13} />
                  Copy
                </Button>
                {!readOnly && onRevise ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={!canRevise}
                    onClick={() => onRevise(answer.text)}
                    className="text-foreground/48 hover:text-foreground h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                  >
                    <PencilSimple size={13} />
                    Revise
                  </Button>
                ) : null}
                {!readOnly && onAskCoach ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onAskCoach(answer.text)}
                    className="text-foreground/48 hover:text-foreground h-7 border-0 px-2 text-[11px] shadow-none before:hidden"
                  >
                    <ChatCircle size={13} />
                    Ask coach about this
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
