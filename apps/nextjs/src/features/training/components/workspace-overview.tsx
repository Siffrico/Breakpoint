import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type WorkspaceState = RouterOutputs["training"]["home"];

export function WorkspaceOverview({
  workspace,
  sessionId,
  preview = false,
}: {
  workspace: WorkspaceState;
  sessionId: string;
  preview?: boolean;
}) {
  const progress = workspace.totalUnits > 0
    ? Math.round((workspace.completedUnits / workspace.totalUnits) * 100)
    : 0;
  const activeUnitId = workspace.nextUnitId;
  const trainHref = preview
    ? "/ui/train"
    : `/workspace?session=${sessionId}`;
  const planHref = preview ? "/ui/plan" : `/plan?session=${sessionId}`;
  const profileHref = preview ? "/ui/profile" : `/settings?session=${sessionId}`;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl border-x border-border/50">
        <section className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="font-mono text-xs text-muted-foreground">
            {workspace.completedUnits}/{workspace.totalUnits} units
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {progress}%
          </span>
        </section>

        <section className="border-b border-border p-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {workspace.targetIdentity}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {workspace.headline}
          </p>
        </section>

        <section className="border-b border-border p-6">
          <h2 className="font-display text-lg tracking-[-0.03em]">
            {workspace.nextUnitTitle ?? "Path generated"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {workspace.planSummary}
          </p>
          <div className="mt-5">
            {activeUnitId ? (
              <Button
                render={<Link href={trainHref} />}
                className="h-10 rounded-none bg-white px-5 text-black hover:bg-white/90"
              >
                Continue training
              </Button>
            ) : null}
          </div>
        </section>

        <section className="border-b border-border p-6">
          <details>
            <summary className="cursor-pointer text-sm text-foreground">
              {workspace.blockingSignals.length} patterns blocking progress
            </summary>
            <div className="mt-3">
              {workspace.blockingSignals.map((signal) => (
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

        <section className="flex gap-3 p-6">
          <Button
            render={<Link href={planHref} />}
            variant="outline"
            className="h-10 rounded-none border-border bg-transparent px-5 text-foreground hover:bg-white/5"
          >
            View path
          </Button>
          <Button
            render={<Link href={profileHref} />}
            variant="outline"
            className="h-10 rounded-none border-border bg-transparent px-5 text-foreground hover:bg-white/5"
          >
            Identity profile
          </Button>
        </section>
      </div>
    </main>
  );
}
