import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { ProfilePreferences } from "./profile-preferences";

type ProfileState = RouterOutputs["training"]["profile"];

export function ProfileOverview({
  profile,
  sessionId,
  preview = false,
}: {
  profile: ProfileState;
  sessionId: string;
  preview?: boolean;
}) {
  const backHref = preview
    ? "/ui/workspace"
    : `/workspace?session=${sessionId}`;

  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="border-border/50 mx-auto max-w-3xl border-x">
        <section className="border-border border-b px-6 py-4">
          <div className="flex gap-3">
            <Button
              render={<Link href={backHref} />}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:text-foreground h-8 rounded-none bg-transparent px-3 text-xs hover:bg-white/5"
            >
              &larr; Back to workspace
            </Button>
          </div>
        </section>

        <section className="border-border border-b p-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {profile.targetIdentity}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {profile.headline}
          </p>
        </section>

        <section className="border-border border-b p-6">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            Motivation
          </div>
          <p className="text-foreground/80 mt-3 text-sm leading-6">
            {profile.motivation}
          </p>
        </section>

        <section className="border-border border-b p-6">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            Current baseline
          </div>
          <p className="text-foreground/80 mt-3 text-sm leading-6">
            {profile.currentBaseline}
          </p>
        </section>

        <section className="border-border border-b p-6">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            Hard moments
          </div>
          <div className="mt-3">
            {profile.hardMoments.map((moment) => (
              <div
                key={moment}
                className="border-border text-foreground/80 border-b py-3 text-sm leading-6 last:border-b-0"
              >
                {moment}
              </div>
            ))}
          </div>
        </section>

        <section className="border-border border-b p-6">
          <div className="text-muted-foreground text-xs tracking-wider uppercase">
            Behavior signals
          </div>
          <div className="mt-3">
            {profile.behaviorSignals.map((signal) => (
              <div
                key={signal}
                className="border-border text-foreground/80 border-b py-3 text-sm leading-6 last:border-b-0"
              >
                {signal}
              </div>
            ))}
          </div>
        </section>

        <ProfilePreferences />
      </div>
    </main>
  );
}
