import { MockFrame } from "./mock-frame";

type Kind = "Foundation" | "Unit" | "Simulation" | "Capstone";

const KIND_COLOR: Record<Kind, string> = {
  Foundation: "var(--bp-read)",
  Unit: "var(--bp-edit)",
  Simulation: "var(--bp-think)",
  Capstone: "var(--bp-accent)",
};

interface PathNode {
  kind: Kind;
  title: string;
  state: "done" | "active" | "locked";
  meta?: string;
}

const NODES: PathNode[] = [
  { kind: "Foundation", title: "Principled concession theory", state: "done" },
  { kind: "Unit", title: "Anchoring & first offers", state: "done" },
  { kind: "Unit", title: "Reading counter-pressure", state: "active" },
  {
    kind: "Simulation",
    title: "Hostile counterpart",
    state: "locked",
    meta: "Calibrated to difficulty 7",
  },
  { kind: "Unit", title: "Trade construction", state: "locked" },
  { kind: "Capstone", title: "Negotiate a real vendor deal", state: "locked" },
];

/** Mockup 2 — how Breakpoint builds your curriculum. */
export function MockupCurriculum() {
  return (
    <MockFrame
      label="breakpoint — curriculum"
      accessory={
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--bp-accent)]" />
          Generated
        </span>
      }
    >
      <div className="bp-mock-grid p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[13px] text-[var(--bp-fg)]">
            Your path — negotiation under pressure
          </p>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
            6 nodes · ~4 wks
          </span>
        </div>

        <div>
          {NODES.map((n, i) => (
            <div key={n.title} className="relative flex gap-3.5 pb-3 last:pb-0">
              {i < NODES.length - 1 ? (
                <span className="absolute top-5 left-[7px] h-full w-px bg-[var(--bp-border)]" />
              ) : null}
              <span
                className="relative z-10 mt-1 size-3.5 shrink-0 rounded-full border-2"
                style={{
                  borderColor:
                    n.state === "active"
                      ? "var(--bp-accent)"
                      : n.state === "locked"
                        ? "var(--bp-border-strong)"
                        : KIND_COLOR[n.kind],
                  background:
                    n.state === "done"
                      ? KIND_COLOR[n.kind]
                      : n.state === "active"
                        ? "var(--bp-accent)"
                        : "var(--bp-card)",
                }}
              />
              <div
                className="flex-1 rounded-lg border p-3"
                style={{
                  borderColor:
                    n.state === "active"
                      ? "color-mix(in srgb, var(--bp-accent) 40%, transparent)"
                      : "var(--bp-border)",
                  background:
                    n.state === "locked"
                      ? "var(--bp-card-01)"
                      : "var(--bp-card-02)",
                  opacity: n.state === "locked" ? 0.62 : 1,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-1.5 rounded-[2px]"
                    style={{ background: KIND_COLOR[n.kind] }}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--bp-text-tert)]">
                    {n.kind}
                  </span>
                  {n.state === "active" ? (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bp-accent)]">
                      In progress
                    </span>
                  ) : null}
                  {n.state === "done" ? (
                    <span className="ml-auto font-mono text-[11px] text-[var(--bp-grep)]">
                      ✓
                    </span>
                  ) : null}
                  {n.state === "locked" ? (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--bp-text-tert)]">
                      Locked
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] text-[var(--bp-fg)]">{n.title}</p>
                {n.meta ? (
                  <p className="mt-0.5 text-[11px] text-[var(--bp-text-sec)]">
                    {n.meta}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-card-02)] px-3 py-2.5">
          <span className="size-1.5 rounded-full bg-[var(--bp-accent)]" />
          <span className="text-[12px] text-[var(--bp-text-sec)]">
            Reshapes after every unit you finish.
          </span>
        </div>
      </div>
    </MockFrame>
  );
}
