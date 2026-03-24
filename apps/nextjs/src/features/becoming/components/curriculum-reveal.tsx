"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";
import type { TreeNode } from "@acme/ui/tree";
import { TreeView } from "@acme/ui/tree";

type Plan = RouterOutputs["becoming"]["activePlan"];

function buildTree(nodes: Plan["nodes"]): TreeNode[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string | null, Plan["nodes"]>();

  for (const node of nodes) {
    const parentId = node.parentNodeId;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(node);
  }

  function convert(node: Plan["nodes"][number]): TreeNode {
    const children = childrenMap.get(node.id) ?? [];
    return {
      id: node.id,
      label: node.title,
      variant: node.kind === "simulation" ? "simulation" : "default",
      status: node.status as TreeNode["status"],
      children: children.length > 0
        ? children
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map(convert)
        : undefined,
    };
  }

  const roots = childrenMap.get(null) ?? [];
  return roots.sort((a, b) => a.orderIndex - b.orderIndex).map(convert);
}

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
  const beginHref = preview ? "/ui/train" : `/train/${plan.nextUnitId}?session=${sessionId}`;
  const workspaceHref = preview ? "/ui/home" : `/home?session=${sessionId}`;

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
