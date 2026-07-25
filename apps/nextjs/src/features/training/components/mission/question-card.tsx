"use client";

import { useState } from "react";

export function QuestionCard({
  question,
  options,
  onAnswer,
}: {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
}) {
  const [detail, setDetail] = useState("");
  return (
    <section>
      <p className="text-[19px] leading-[1.35] font-medium tracking-[-0.01em] text-[var(--site-fg)]">
        {question}
      </p>
      <div className="mt-6 flex flex-col gap-2.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onAnswer(option)}
            className="w-full rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)] px-4 py-3.5 text-left text-[14px] leading-relaxed text-[var(--site-fg)] transition-colors outline-none hover:border-[var(--site-line-strong)]"
          >
            {option}
          </button>
        ))}
      </div>
      <form
        className="mt-6 flex items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (detail.trim()) onAnswer(detail);
        }}
      >
        <input
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="Tell me more"
          className="min-w-0 flex-1 border-b border-[var(--site-line)] bg-transparent px-1 py-2.5 text-[14px] text-[var(--site-fg)] transition-colors outline-none placeholder:text-[var(--site-text-3)] focus:border-[var(--site-line-strong)]"
        />
        <button
          className="text-[14px] text-[var(--site-text-2)] transition-colors outline-none hover:text-[var(--site-fg)]"
          type="submit"
        >
          Send
        </button>
      </form>
    </section>
  );
}
