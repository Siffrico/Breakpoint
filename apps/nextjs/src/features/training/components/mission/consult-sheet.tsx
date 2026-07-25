"use client";

import { useState } from "react";

import { Button } from "@acme/ui/button";

export function ConsultSheet({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  if (!open) return null;
  return (
    <aside
      aria-label="Mission consult"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-[var(--site-line)] bg-[var(--site-bg)] p-6 shadow-2xl"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close consult"
        className="absolute top-5 right-6 text-[var(--site-text-2)] transition-colors outline-none hover:text-[var(--site-fg)]"
      >
        ×
      </button>
      <p className="pr-8 text-[14px] leading-relaxed text-[var(--site-text-2)]">
        Tell me what needs to change. I’ll reshape the plan in place.
      </p>
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!message.trim()) return;
          onSend(message);
          setMessage("");
        }}
      >
        <textarea
          autoFocus
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-32 w-full rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)] p-3.5 text-[14px] leading-relaxed text-[var(--site-fg)] transition-colors outline-none placeholder:text-[var(--site-text-3)] focus:border-[var(--site-line-strong)]"
          placeholder="No oven at home…"
        />
        <Button
          type="submit"
          size="lg"
          className="mt-3 w-full border-[var(--site-line)]"
        >
          Send
        </Button>
      </form>
    </aside>
  );
}
