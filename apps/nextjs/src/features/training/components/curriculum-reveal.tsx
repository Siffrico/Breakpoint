"use client";

import { useMemo } from "react";
import Link from "next/link";

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
  const unitCount = plan.nodes.filter((n) => n.kind === "unit").length;
  const beginHref = preview ? "/ui/train" : `/workspace?session=${sessionId}`;
  const workspaceHref = preview
    ? "/ui/workspace"
    : `/workspace?session=${sessionId}`;

  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="border-border/50 mx-auto max-w-3xl border-x">
        <section className="border-border border-b p-6">
          <h1 className="font-display text-2xl tracking-[-0.04em]">
            {plan.title}
          </h1>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            {unitCount} units
          </div>
        </section>

        <section className="border-border border-b p-6">
          <p className="text-muted-foreground text-sm leading-6">
            {plan.summary}
          </p>
        </section>

        <section className="border-border border-b p-6">
          <TreeView nodes={tree} defaultExpanded />
        </section>

        <section className="flex gap-3 p-6">
          {plan.nextUnitId ? (
            <Button
              render={<Link href={beginHref} />}
              className="h-10 rounded-none bg-white px-5 text-black hover:bg-white/90"
            >
              Begin first unit
            </Button>
          ) : null}
          <Button
            render={<Link href={workspaceHref} />}
            variant="outline"
            className="border-border text-foreground h-10 rounded-none bg-transparent px-5 hover:bg-white/5"
          >
            Back
          </Button>
        </section>
      </div>
    </main>
  );
}
