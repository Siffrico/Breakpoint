"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import { TreeView } from "@acme/ui/tree";

import { buildTree } from "~/features/training/lib/build-tree";

type Plan = RouterOutputs["training"]["activePlan"];

export function CurriculumReveal({
  plan,
  sessionId,
  preview = false,
}: {
  plan: Plan;
  sessionId: string;
  preview?: boolean;
}) {
  const tree = useMemo(() => buildTree(plan.nodes), [plan.nodes]);
  const unitCount = plan.nodes.filter(
    (n) => n.kind === "unit" || n.kind === "integration",
  ).length;
  const beginHref = preview ? "/ui/train" : `/workspace?session=${sessionId}`;
  const workspaceHref = preview ? "/ui/workspace" : `/workspace?session=${sessionId}`;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl border-x border-border/50">
        <section className="border-b border-border px-6 py-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {plan.title}
          </h1>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {unitCount} units
          </div>
        </section>

        <section className="border-b border-border px-6 py-6">
          <p className="text-sm leading-6 text-muted-foreground">
            {plan.summary}
          </p>
        </section>

        <section className="border-b border-border px-6 py-6">
          <TreeView nodes={tree} defaultExpanded />
        </section>

        <section className="flex gap-3 px-6 py-6">
          {plan.nextUnitId ? (
            <Button
              asChild
              className="h-10 rounded-none bg-white px-5 text-black hover:bg-white/90"
            >
              <Link href={beginHref}>Begin first unit</Link>
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-none border-border bg-transparent px-5 text-foreground hover:bg-white/5"
          >
            <Link href={workspaceHref}>Back</Link>
          </Button>
        </section>
      </div>
    </main>
  );
}
