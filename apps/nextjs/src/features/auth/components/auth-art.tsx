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
    <div className="bp-page-bg border-border relative flex h-full w-full flex-col justify-between overflow-hidden border-r p-12 xl:p-16">
      {/* faint technical grid, clinical, not theatrical */}
      <div
        aria-hidden
        className="bp-grid-line pointer-events-none absolute inset-0 opacity-50"
      />

      {/* top meta strip */}
      <div className="text-muted-foreground relative flex items-center justify-between font-mono text-[10px] tracking-[0.4em] uppercase">
        <div className="flex items-center gap-2.5">
          <span className="bg-primary size-2.5 rounded-full" />
          <span>Breakpoint</span>
        </div>
        <span>v0.1, Secure</span>
      </div>

      {/* wordmark */}
      <div className="relative">
        <h1 className="font-display text-foreground text-5xl leading-[0.95] font-semibold tracking-[-0.02em] uppercase xl:text-6xl">
          Breakpoint
        </h1>
        <div className="bg-primary mt-6 h-0.5 w-14" />
        <p className="text-muted-foreground mt-6 max-w-sm text-sm leading-relaxed">
          Leveled simulation environments for deep skill-building. Train under
          pressure. Prove what you can do.
        </p>
      </div>

      {/* capability ladder, implies movement through a system */}
      <div className="border-border relative border-t">
        {CAPABILITIES.map((c) => (
          <div
            key={c.id}
            className="border-border flex items-baseline gap-5 border-b py-4"
          >
            <span className="text-muted-foreground/70 font-mono text-[11px] tabular-nums">
              {c.id}
            </span>
            <div>
              <div className="text-foreground font-mono text-xs tracking-[0.28em] uppercase">
                {c.label}
              </div>
              <div className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {c.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
