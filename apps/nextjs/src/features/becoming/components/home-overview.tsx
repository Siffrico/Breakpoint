import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type HomeState = RouterOutputs["becoming"]["home"];

export function HomeOverview({
  home,
  sessionId,
  preview = false,
}: {
  home: HomeState;
  sessionId: string;
  preview?: boolean;
}) {
  const progress = home.totalUnits > 0
    ? Math.round((home.completedUnits / home.totalUnits) * 100)
    : 0;
  const activeUnitId = home.activeRecallGate?.triggerAfterUnitNodeId ?? home.nextUnitId;
  const trainHref = preview
    ? "/ui/train"
    : `/home?session=${sessionId}`;
  const planHref = preview ? "/ui/plan" : `/plan?session=${sessionId}`;
  const profileHref = preview ? "/ui/profile" : `/profile?session=${sessionId}`;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl border-x border-border/50">
        <section className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="font-mono text-xs text-muted-foreground">
            {home.completedUnits}/{home.totalUnits} units
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {progress}%
          </span>
        </section>

        <section className="border-b border-border px-6 py-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {home.targetIdentity}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {home.headline}
          </p>
        </section>

        <section className="border-b border-border px-6 py-6">
          <h2 className="font-display text-lg tracking-[-0.03em]">
            {home.activeRecallGate
              ? "Recall gate active"
              : (home.nextUnitTitle ?? "Path generated")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {home.activeRecallGate
              ? "Before the next unit unlocks, you need to prove earlier concepts are still live."
              : home.planSummary}
          </p>
          <div className="mt-5">
            {activeUnitId ? (
              <Button
                asChild
                className="h-10 rounded-none bg-white px-5 text-black hover:bg-white/90"
              >
                <Link href={trainHref}>
                  {home.activeRecallGate ? "Open recall gate" : "Continue training"}
                </Link>
              </Button>
            ) : null}
          </div>
        </section>

        <section className="border-b border-border px-6 py-6">
          <details>
            <summary className="cursor-pointer text-sm text-foreground">
              {home.blockingSignals.length} patterns blocking progress
            </summary>
            <div className="mt-3">
              {home.blockingSignals.map((signal) => (
                <div
                  key={signal}
                  className="border-b border-border py-3 text-sm leading-6 text-muted-foreground last:border-b-0"
                >
                  {signal}
                </div>
              ))}
            </div>
          </details>
        </section>

        <section className="flex gap-3 px-6 py-6">
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-none border-border bg-transparent px-5 text-foreground hover:bg-white/5"
          >
            <Link href={planHref}>View path</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-none border-border bg-transparent px-5 text-foreground hover:bg-white/5"
          >
            <Link href={profileHref}>Identity profile</Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
