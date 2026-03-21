import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type HomeState = RouterOutputs["becoming"]["home"];

export function HomeOverview({
  home,
  sessionId,
}: {
  home: HomeState;
  sessionId: string;
}) {
  const progress = home.totalUnits > 0
    ? Math.round((home.completedUnits / home.totalUnits) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/8 pb-6">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-white/35">
              Active Path
            </p>
            <h1 className="font-display mt-3 text-4xl tracking-[-0.06em] sm:text-5xl">
              {home.targetIdentity}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/60">
              {home.headline}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs tracking-[0.28em] uppercase text-white/35">
              Progress
            </div>
            <div className="mt-3 font-display text-5xl tracking-[-0.06em]">
              {progress}%
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs tracking-[0.26em] uppercase text-white/35">
              Next
            </p>
            <h2 className="font-display mt-3 text-3xl tracking-[-0.05em]">
              {home.nextUnitTitle ?? "Path generated"}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/55">
              {home.planSummary}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {home.nextUnitId ? (
                <Button asChild className="h-11 rounded-none bg-white px-5 text-black hover:bg-white/90">
                  <Link href={`/train/${home.nextUnitId}?session=${sessionId}`}>
                    Continue
                  </Link>
                </Button>
              ) : null}
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-none border-white/15 bg-transparent px-5 text-white hover:bg-white/5 hover:text-white"
              >
                <Link href={`/plan?session=${sessionId}`}>View path</Link>
              </Button>
            </div>
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs tracking-[0.26em] uppercase text-white/35">
              Blocking Signals
            </p>
            <div className="mt-5 space-y-3">
              {home.blockingSignals.map((signal) => (
                <div
                  key={signal}
                  className="border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-white/70"
                >
                  {signal}
                </div>
              ))}
            </div>
            <Button
              asChild
              variant="outline"
              className="mt-6 h-11 rounded-none border-white/15 bg-transparent px-5 text-white hover:bg-white/5 hover:text-white"
            >
              <Link href={`/profile?session=${sessionId}`}>Open identity profile</Link>
            </Button>
          </section>
        </div>
      </div>
    </main>
  );
}
