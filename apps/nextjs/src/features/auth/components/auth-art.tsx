const CAPABILITIES = [
  { id: "01", label: "Identity", detail: "Confirm who you are. Once." },
  {
    id: "02",
    label: "Access",
    detail: "Enter leveled simulation environments.",
  },
  {
    id: "03",
    label: "Momentum",
    detail: "Earn progress through escalating tiers.",
  },
] as const;

export function AuthArt() {
  return (
    <div className="bp-page-bg relative flex h-full w-full flex-col justify-between overflow-hidden border-r border-border p-12 xl:p-16">
      {/* faint technical grid, clinical, not theatrical */}
      <div
        aria-hidden
        className="bp-grid-line pointer-events-none absolute inset-0 opacity-50"
      />

      {/* top meta strip */}
      <div className="relative flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 rounded-full bg-primary" />
          <span>Breakpoint</span>
        </div>
        <span>v0.1, Secure</span>
      </div>

      {/* wordmark */}
      <div className="relative">
        <h1 className="font-display text-5xl font-semibold uppercase leading-[0.95] tracking-[-0.02em] text-foreground xl:text-6xl">
          Breakpoint
        </h1>
        <div className="mt-6 h-0.5 w-14 bg-primary" />
        <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Leveled simulation environments for deep skill-building. Train under
          pressure. Prove what you can do.
        </p>
      </div>

      {/* capability ladder, implies movement through a system */}
      <div className="relative border-t border-border">
        {CAPABILITIES.map((c) => (
          <div
            key={c.id}
            className="flex items-baseline gap-5 border-b border-border py-4"
          >
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">
              {c.id}
            </span>
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.28em] text-foreground">
                {c.label}
              </div>
              <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {c.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
