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
  const backHref = preview ? "/ui/workspace" : `/workspace?session=${sessionId}`;
  const transformationHref = preview
    ? "/ui/transformation"
    : `/transformation?session=${sessionId}`;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl border-x border-border/50">
        <section className="border-b border-border px-6 py-4">
          <div className="flex gap-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-border bg-transparent px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Link href={backHref}>&larr; Back to workspace</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 rounded-none border-border bg-transparent px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Link href={transformationHref}>Before / after</Link>
            </Button>
          </div>
        </section>

        <section className="border-b border-border px-6 py-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {profile.targetIdentity}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {profile.headline}
          </p>
        </section>

        <section className="border-b border-border px-6 py-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Motivation
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground/80">
            {profile.motivation}
          </p>
        </section>

        <section className="border-b border-border px-6 py-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Current baseline
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground/80">
            {profile.currentBaseline}
          </p>
        </section>

        <section className="border-b border-border px-6 py-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Hard moments
          </div>
          <div className="mt-3">
            {profile.hardMoments.map((moment) => (
              <div
                key={moment}
                className="border-b border-border py-3 text-sm leading-6 text-foreground/80 last:border-b-0"
              >
                {moment}
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-border px-6 py-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Behavior signals
          </div>
          <div className="mt-3">
            {profile.behaviorSignals.map((signal) => (
              <div
                key={signal}
                className="border-b border-border py-3 text-sm leading-6 text-foreground/80 last:border-b-0"
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
