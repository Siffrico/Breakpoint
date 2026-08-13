"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

import { useTRPC } from "~/trpc/react";

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
  const trpc = useTRPC();
  const missions = useQuery(
    trpc.missions.resumable.queryOptions({ sessionId }),
  );
  const resumableMission = missions.data?.[0] ?? null;
  const progress =
    workspace.totalOutcomes > 0
      ? Math.round(
          (workspace.completedOutcomes / workspace.totalOutcomes) * 100,
        )
      : 0;
  const activeUnitId = workspace.nextUnitId;
  const trainHref = preview ? "/ui/train" : `/workspace?session=${sessionId}`;
  const planHref = preview ? "/ui/plan" : `/plan?session=${sessionId}`;
  const profileHref = preview
    ? "/ui/profile"
    : `/settings?session=${sessionId}`;

  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="border-border/50 mx-auto max-w-3xl border-x">
        <section className="border-border flex items-center justify-between border-b px-6 py-4">
          <span className="text-muted-foreground font-mono text-xs">
            {workspace.completedOutcomes}/{workspace.totalOutcomes} outcomes
          </span>
          <span className="text-muted-foreground font-mono text-xs">
            {progress}%
          </span>
        </section>

        <section className="border-border border-b p-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {workspace.targetIdentity}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            {workspace.headline}
          </p>
        </section>

        {resumableMission ? (
          <section className="border-border border-b p-6">
            <p className="text-sm font-medium">🎯 Field mission</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {resumableMission.spec?.title ??
                "Your mission is ready to continue."}
            </p>
            <Link
              href={`/workspace/mission?unitRunId=${resumableMission.unitRunId}`}
              className="mt-4 inline-block text-sm underline"
            >
              Continue mission →
            </Link>
          </section>
        ) : null}

        <section className="border-border border-b p-6">
          <h2 className="font-display text-lg tracking-[-0.03em]">
            {workspace.nextUnitTitle ?? "Path generated"}
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
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

        <section className="border-border border-b p-6">
          <details>
            <summary className="text-foreground cursor-pointer text-sm">
              {workspace.blockingSignals.length} patterns blocking progress
            </summary>
            <div className="mt-3">
              {workspace.blockingSignals.map((signal) => (
                <div
                  key={signal}
                  className="border-border text-muted-foreground border-b py-3 text-sm leading-6 last:border-b-0"
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
            className="border-border text-foreground h-10 rounded-none bg-transparent px-5 hover:bg-white/5"
          >
            View path
          </Button>
          <Button
            render={<Link href={profileHref} />}
            variant="outline"
            className="border-border text-foreground h-10 rounded-none bg-transparent px-5 hover:bg-white/5"
          >
            Identity profile
          </Button>
        </section>
      </div>
    </main>
  );
}
