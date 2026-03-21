"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type Plan = RouterOutputs["becoming"]["activePlan"];

export function CurriculumReveal({
  plan,
  sessionId,
  preview = false,
}: {
  plan: Plan;
  sessionId: string;
  preview?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 140);
    return () => window.clearTimeout(timer);
  }, []);

  const nodesById = useMemo(
    () => new Map(plan.nodes.map((node) => [node.id, node])),
    [plan.nodes],
  );

  const connectors = plan.nodes
    .filter((node) => node.parentNodeId)
    .map((node) => {
      const parent = nodesById.get(node.parentNodeId!);
      if (!parent) {
        return null;
      }

      const startX = ((parent.positionColumn + 0.5) / 5) * 100;
      const startY = ((parent.positionRow + 0.5) / 4) * 100;
      const endX = ((node.positionColumn + 0.5) / 5) * 100;
      const endY = ((node.positionRow + 0.5) / 4) * 100;
      const midY = (startY + endY) / 2;

      return `${startX},${startY} ${startX},${midY} ${endX},${midY} ${endX},${endY}`;
    })
    .filter(Boolean) as string[];
  const beginHref = preview ? "/ui/train" : `/train/${plan.nextUnitId}?session=${sessionId}`;
  const workspaceHref = preview ? "/ui/home" : `/home?session=${sessionId}`;

  return (
    <main className="min-h-screen bg-[#06070a] px-5 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <div className="flex items-center justify-between border-b border-white/8 pb-5">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-white/35">
              Path Generated
            </p>
            <h1 className="font-display mt-3 text-4xl tracking-[-0.06em] text-white sm:text-5xl">
              {plan.title}
            </h1>
          </div>
          <div className="text-right text-sm text-white/45">
            <div>{plan.targetIdentity}</div>
            <div>{plan.nodes.filter((node) => node.kind === "unit").length} units mapped</div>
          </div>
        </div>

        <div className="max-w-3xl text-lg leading-8 text-white/65">
          {plan.summary}
        </div>

        <div className="relative hidden min-h-[680px] border border-white/8 bg-white/[0.02] p-10 lg:block">
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {connectors.map((points, index) => (
              <polyline
                key={points}
                points={points}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="0.5"
                strokeDasharray={index % 2 === 0 ? "0" : "1.2 1.2"}
              />
            ))}
          </svg>

          <div className="grid h-full grid-cols-5 grid-rows-4 gap-x-6 gap-y-10">
            {plan.nodes.map((node) => (
              <div
                key={node.id}
                className={[
                  "border px-4 py-4 transition-all duration-500",
                  revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
                  node.status === "ready"
                    ? "border-white/20 bg-white/[0.08]"
                    : node.kind === "simulation"
                      ? "border-white/15 bg-white/[0.04]"
                      : "border-white/10 bg-white/[0.03]",
                ].join(" ")}
                style={{
                  gridColumnStart: node.positionColumn + 1,
                  gridRowStart: node.positionRow + 1,
                  transitionDelay: `${node.orderIndex * 70}ms`,
                }}
              >
                <div className="mb-3 text-[10px] tracking-[0.28em] uppercase text-white/35">
                  {node.kind.replace("_", " ")}
                </div>
                <div className="font-display text-xl tracking-[-0.05em] text-white">
                  {node.title}
                </div>
                <div className="mt-3 text-sm leading-7 text-white/55">
                  {node.summary}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:hidden">
          {plan.nodes.map((node) => (
            <div key={node.id} className="border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-[10px] tracking-[0.28em] uppercase text-white/35">
                {node.kind.replace("_", " ")}
              </div>
              <div className="font-display mt-2 text-2xl tracking-[-0.04em]">
                {node.title}
              </div>
              <div className="mt-3 text-sm leading-7 text-white/55">
                {node.summary}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {plan.nextUnitId ? (
            <Button asChild className="h-11 rounded-none bg-white px-5 text-black hover:bg-white/90">
              <Link href={beginHref}>
                Begin first unit
              </Link>
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-none border-white/15 bg-transparent px-5 text-white hover:bg-white/5 hover:text-white"
          >
            <Link href={workspaceHref}>Open workspace</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
