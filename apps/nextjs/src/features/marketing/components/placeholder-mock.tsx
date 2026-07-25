import { cn } from "@acme/ui";

/**
 * Stand-in for a product mockup. The window chrome + sizing are already wired
 * into the page layout — swap the body for the real UI later.
 */
export function PlaceholderMock({
  label,
  ratio = "16 / 10",
  className,
}: {
  label: string;
  ratio?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border border-[var(--bp-border)] bg-[var(--bp-card)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--bp-border-soft)] bg-[var(--bp-card-01)] px-4 py-3">
        <span className="size-2.5 bg-[var(--bp-border-strong)]" />
        <span className="size-2.5 bg-[var(--bp-border-strong)]" />
        <span className="size-2.5 bg-[var(--bp-border-strong)]" />
      </div>
      <div
        className="flex flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ aspectRatio: ratio }}
      >
        <span className="font-mono text-[11px] tracking-[0.24em] text-[var(--bp-text-tert)] uppercase">
          Placeholder mock
        </span>
        <span className="text-[13px] text-[var(--bp-text-sec)]">{label}</span>
      </div>
    </div>
  );
}
