import { MockFrame } from "./mock-frame";

/** Mockup 3 — how a single education unit works. */
export function MockupUnit() {
  return (
    <MockFrame
      label="breakpoint — unit · reading counter-pressure"
      accessory={
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
          Step 4 / 6
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {/* concept */}
        <div className="border-b border-[var(--bp-border-soft)] p-5 sm:border-r sm:border-b-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
            Concept
          </p>
          <h4 className="mt-2 text-[15px] tracking-[-0.01em] text-[var(--bp-fg)]">
            The flinch tell
          </h4>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--bp-text-sec)]">
            When a counterpart escalates, they leak intent in the half-second
            before they speak. A{" "}
            <span
              className="rounded-[3px] px-1"
              style={{ background: "var(--bp-accent-soft)", color: "var(--bp-fg)" }}
            >
              flinch
            </span>{" "}
            is pressure, not a position — and pressure can be waited out.
          </p>
          <div className="mt-4 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card-02)] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bp-text-tert)]">
              Watch for
            </p>
            <ul className="mt-1.5 space-y-1 text-[12px] text-[var(--bp-text-sec)]">
              <li>— Deadlines that appear mid-sentence</li>
              <li>— A sudden third party in the room</li>
            </ul>
          </div>
        </div>

        {/* your turn */}
        <div className="bp-mock-grid p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-edit)]">
            Your turn
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--bp-fg-soft)]">
            They just said "I'd move fast — I have other offers." Name the tell,
            then write your next line.
          </p>
          <div className="mt-3 rounded-lg border border-[var(--bp-border-strong)] bg-[var(--bp-card-02)] p-3">
            <p className="text-[12.5px] leading-relaxed text-[var(--bp-fg)]">
              That's a flinch. I'd hold the silence, then: "Other offers are
              good — let's make sure mine is the one you'd regret losing."
            </p>
            <span className="mt-1 inline-block h-3 w-px animate-pulse bg-[var(--bp-accent)] align-middle" />
          </div>
          <div
            className="mt-3 flex items-start gap-2 rounded-lg p-3"
            style={{
              background: "color-mix(in srgb, var(--bp-success) 12%, transparent)",
            }}
          >
            <span
              className="font-mono text-[11px]"
              style={{ color: "var(--bp-grep)" }}
            >
              ✓
            </span>
            <p className="text-[12px] leading-relaxed text-[var(--bp-fg-soft)]">
              Correct — you read it as pressure and refused the deadline. That
              is the rep.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full"
                style={{
                  background: s <= 4 ? "var(--bp-accent)" : "var(--bp-card-04)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </MockFrame>
  );
}
