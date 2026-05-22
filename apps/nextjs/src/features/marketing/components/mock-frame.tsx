import type { ReactNode } from "react";

import { cn } from "@acme/ui";

/**
 * Shared window chrome for the landing-page mockups. The surface sits one
 * step lighter than the page (`--bp-card`) so it reads as an elevated panel —
 * the same bg→card delta cursor.com uses.
 */
export function MockFrame({
  label,
  accessory,
  children,
  className,
}: {
  label: string;
  accessory?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-card)]",
        "shadow-[0_50px_140px_-50px_rgba(0,0,0,0.85)]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-[var(--bp-border-soft)] bg-[var(--bp-card-01)] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--bp-border-strong)]" />
          <span className="size-2.5 rounded-full bg-[var(--bp-border-strong)]" />
          <span className="size-2.5 rounded-full bg-[var(--bp-border-strong)]" />
        </div>
        <span className="truncate font-mono text-[11px] tracking-tight text-[var(--bp-text-tert)]">
          {label}
        </span>
        {accessory ? <div className="ml-auto shrink-0">{accessory}</div> : null}
      </div>
      {children}
    </div>
  );
}
