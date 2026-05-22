import { MockFrame } from "./mock-frame";

const MILESTONES = [
  { text: "Scope a real vendor deal worth closing", done: true },
  { text: "Run the negotiation across 3 live rounds", done: true },
  { text: "Draft the deal memo with tradeoff rationale", done: true },
  { text: "Defend it in a recorded debrief", done: false },
];

const SKILLS = [
  "Anchoring",
  "Concession control",
  "Tradeoff framing",
  "Written rationale",
];

/** Mockup 4 — how Breakpoint helps you build portfolio-grade projects. */
export function MockupProject() {
  return (
    <MockFrame
      label="breakpoint — capstone · build"
      accessory={
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
          Project
        </span>
      }
    >
      <div className="bp-mock-grid p-5 sm:p-6">
        <div className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card-02)] p-4">
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-[2px] bg-[var(--bp-accent)]" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
              Capstone brief
            </span>
          </div>
          <h4 className="mt-2 text-[15px] tracking-[-0.01em] text-[var(--bp-fg)]">
            Negotiate and document a real vendor deal
          </h4>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--bp-text-sec)]">
            Ship an artifact a hiring manager would actually want to read.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {MILESTONES.map((m) => (
            <div key={m.text} className="flex items-center gap-2.5">
              <span
                className="grid size-4 shrink-0 place-items-center rounded-full font-mono text-[9px]"
                style={{
                  background: m.done ? "var(--bp-grep)" : "transparent",
                  border: m.done ? "none" : "1.5px solid var(--bp-border-strong)",
                  color: "var(--bp-bg)",
                }}
              >
                {m.done ? "✓" : ""}
              </span>
              <span
                className="text-[12.5px]"
                style={{
                  color: m.done ? "var(--bp-text-sec)" : "var(--bp-fg)",
                }}
              >
                {m.text}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card-02)] p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--bp-card-04)] font-mono text-[10px] text-[var(--bp-text-sec)]">
            PDF
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] text-[var(--bp-fg)]">
              Vendor deal memo — final
            </p>
            <p className="text-[11px] text-[var(--bp-text-sec)]">
              Built from your 3 rounds · 4 pages
            </p>
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bp-grep)]">
            Ready
          </span>
        </div>

        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
            Demonstrates
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SKILLS.map((s) => (
              <span
                key={s}
                className="rounded-full border border-[var(--bp-border)] bg-[var(--bp-card-03)] px-2.5 py-1 text-[11px] text-[var(--bp-fg-soft)]"
              >
                {s}
              </span>
            ))}
            <span
              className="rounded-full px-2.5 py-1 text-[11px]"
              style={{
                background: "var(--bp-accent-soft)",
                color: "var(--bp-accent)",
              }}
            >
              Added to profile
            </span>
          </div>
        </div>
      </div>
    </MockFrame>
  );
}
