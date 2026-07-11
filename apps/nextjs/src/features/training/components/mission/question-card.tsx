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
    <section className="border-border bg-card border p-5">
      <p className="text-lg">{question}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onAnswer(option)}
            className="border-border hover:bg-muted rounded-full border px-3 py-2 text-sm"
          >
            {option}
          </button>
        ))}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (detail.trim()) onAnswer(detail);
        }}
      >
        <input
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="Tell me more"
          className="border-border min-w-0 flex-1 border-b bg-transparent px-1 py-2 text-sm outline-none"
        />
        <button className="text-sm" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}
