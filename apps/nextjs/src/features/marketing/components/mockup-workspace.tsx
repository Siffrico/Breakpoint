import type { ReactNode } from "react";

import { MockFrame } from "./mock-frame";

const RAIL = [
  { name: "Negotiation under pressure", active: true },
  { name: "Systems design", active: false },
  { name: "Executive communication", active: false },
  { name: "Cold outreach", active: false },
];

const IN_PROGRESS = [
  {
    title: "Reading counter-pressure",
    kind: "Education unit",
    meta: "Step 4 of 6",
    dot: "var(--bp-edit)",
    pct: 60,
  },
  {
    title: "Hostile counterpart",
    kind: "Simulation",
    meta: "Calibrated · difficulty 7",
    dot: "var(--bp-think)",
    pct: 25,
  },
];

const REVIEW = [
  {
    title: "Anchoring & first offers",
    kind: "Education unit",
    meta: "Passed · +1 level",
    dot: "var(--bp-grep)",
  },
  {
    title: "Negotiate a real vendor deal",
    kind: "Capstone",
    meta: "Portfolio-ready",
    dot: "var(--bp-grep)",
  },
];

/** Mockup 1 — the Breakpoint workspace, used in the hero. */
export function MockupWorkspace() {
  return (
    <MockFrame
      label="breakpoint — negotiation under pressure"
      accessory={
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bp-text-tert)]">
          Workspace
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr]">
        <aside className="hidden flex-col gap-1 border-r border-[var(--bp-border-soft)] bg-[var(--bp-card-01)] p-3 sm:flex">
          <p className="px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bp-text-tert)]">
            Tracks
          </p>
          {RAIL.map((r) => (
            <div
              key={r.name}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px]"
              style={
                r.active
                  ? { background: "var(--bp-card-03)", color: "var(--bp-fg)" }
                  : { color: "var(--bp-text-sec)" }
              }
            >
              <span
                className="size-1.5 rounded-full"
                style={{
                  background: r.active
                    ? "var(--bp-accent)"
                    : "var(--bp-border-strong)",
                }}
              />
              <span className="truncate">{r.name}</span>
            </div>
          ))}
          <div className="mt-auto rounded-md border border-[var(--bp-border)] bg-[var(--bp-card-02)] p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
              This week
            </p>
            <p className="mt-1 text-[13px] text-[var(--bp-fg)]">
              7 reps · 2 gaps closed
            </p>
          </div>
        </aside>

        <div className="bp-mock-grid p-4 sm:p-5">
          <Column title="In progress" count={IN_PROGRESS.length}>
            {IN_PROGRESS.map((c) => (
              <article
                key={c.title}
                className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card-02)] p-3.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-[3px]"
                    style={{ background: c.dot }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
                    {c.kind}
                  </span>
                </div>
                <h4 className="mt-2 text-[13.5px] leading-snug text-[var(--bp-fg)]">
                  {c.title}
                </h4>
                <p className="mt-1 text-[11.5px] text-[var(--bp-text-sec)]">
                  {c.meta}
                </p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--bp-card-04)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${c.pct}%`, background: "var(--bp-accent)" }}
                  />
                </div>
              </article>
            ))}
          </Column>

          <Column title="Ready for review" count={REVIEW.length} className="mt-4">
            {REVIEW.map((c) => (
              <article
                key={c.title}
                className="flex items-center gap-3 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card-02)] p-3.5"
              >
                <span
                  className="size-2 shrink-0 rounded-[3px]"
                  style={{ background: c.dot }}
                />
                <div className="min-w-0">
                  <h4 className="truncate text-[13.5px] text-[var(--bp-fg)]">
                    {c.title}
                  </h4>
                  <p className="text-[11.5px] text-[var(--bp-text-sec)]">
                    {c.meta}
                  </p>
                </div>
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-grep)]">
                  Done
                </span>
              </article>
            ))}
          </Column>
        </div>
      </div>
    </MockFrame>
  );
}

function Column({
  title,
  count,
  className,
  children,
}: {
  title: string;
  count: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--bp-text-sec)]">
          {title}
        </h3>
        <span className="rounded-full bg-[var(--bp-card-03)] px-1.5 text-[10px] text-[var(--bp-text-tert)]">
          {count}
        </span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
