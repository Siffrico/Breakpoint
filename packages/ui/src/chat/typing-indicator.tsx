"use client";

import { cn } from "@acme/ui";

export function TypingIndicator({
  className,
  label = "Assistant is thinking",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "text-foreground/45 inline-flex items-center gap-1.5 text-[13px] leading-7",
        className,
      )}
    >
      <span className="bg-foreground/45 size-1.5 animate-pulse rounded-full [animation-delay:-0.3s] [animation-duration:1.1s]" />
      <span className="bg-foreground/45 size-1.5 animate-pulse rounded-full [animation-delay:-0.15s] [animation-duration:1.1s]" />
      <span className="bg-foreground/45 size-1.5 animate-pulse rounded-full [animation-duration:1.1s]" />
    </div>
  );
}
