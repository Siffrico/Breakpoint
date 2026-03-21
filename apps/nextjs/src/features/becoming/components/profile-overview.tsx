import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type ProfileState = RouterOutputs["becoming"]["profile"];

export function ProfileOverview({
  profile,
  sessionId,
  preview = false,
}: {
  profile: ProfileState;
  sessionId: string;
  preview?: boolean;
}) {
  const backHref = preview ? "/ui/home" : `/home?session=${sessionId}`;

  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="border-b border-white/8 pb-6">
          <p className="text-xs tracking-[0.3em] uppercase text-white/35">
            Identity Profile
          </p>
          <h1 className="font-display mt-3 text-4xl tracking-[-0.06em] sm:text-5xl">
            {profile.targetIdentity}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-white/60">
            {profile.headline}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xs tracking-[0.26em] uppercase text-white/35">
              Motivation
            </h2>
            <p className="mt-4 text-base leading-8 text-white/70">
              {profile.motivation}
            </p>
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xs tracking-[0.26em] uppercase text-white/35">
              Current Baseline
            </h2>
            <p className="mt-4 text-base leading-8 text-white/70">
              {profile.currentBaseline}
            </p>
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xs tracking-[0.26em] uppercase text-white/35">
              Hard Moments
            </h2>
            <div className="mt-4 space-y-3">
              {profile.hardMoments.map((moment) => (
                <div key={moment} className="border border-white/8 px-4 py-3 text-sm text-white/70">
                  {moment}
                </div>
              ))}
            </div>
          </section>

          <section className="border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xs tracking-[0.26em] uppercase text-white/35">
              Behavior Signals
            </h2>
            <div className="mt-4 space-y-3">
              {profile.behaviorSignals.map((signal) => (
                <div key={signal} className="border border-white/8 px-4 py-3 text-sm text-white/70">
                  {signal}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex gap-3">
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-none border-white/15 bg-transparent px-5 text-white hover:bg-white/5 hover:text-white"
          >
            <Link href={backHref}>Back to workspace</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
