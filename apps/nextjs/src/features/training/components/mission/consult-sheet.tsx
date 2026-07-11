"use client";

import { useState } from "react";

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
      className="border-border bg-background fixed inset-y-0 right-0 z-50 w-full max-w-md border-l p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs tracking-[0.16em]">💬 CONSULT</p>
        <button type="button" onClick={onClose} aria-label="Close consult">
          ×
        </button>
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
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
          className="border-border min-h-32 w-full border bg-transparent p-3 text-sm outline-none"
          placeholder="No oven at home…"
        />
        <button
          className="bg-foreground text-background mt-3 rounded-full px-4 py-2 text-sm"
          type="submit"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
