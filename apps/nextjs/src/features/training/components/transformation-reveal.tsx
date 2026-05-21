"use client";

import Link from "next/link";

import type { RouterOutputs } from "@acme/api";
import { Button } from "@acme/ui/button";

type Plan = RouterOutputs["training"]["activePlan"];

export function TransformationReveal({
  plan,
  sessionId,
  preview = false,
}: {
  plan: Plan;
  sessionId: string;
  preview?: boolean;
}) {
  const beginHref = preview ? "/ui/train" : `/workspace?session=${sessionId}`;
  const workspaceHref = preview ? "/ui/workspace" : `/workspace?session=${sessionId}`;
  const beforeAfter = plan.beforeAfter;

  return (
    <main className="min-h-dvh bg-[#070a0d] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-white/45">
          <span>Transformation map</span>
          <span>{plan.targetIdentity}</span>
        </div>

        <section className="relative overflow-hidden border border-white/10 bg-[#0d1217] shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(166,208,255,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(130,255,214,0.08),transparent_35%)]" />
          <div className="pointer-events-none absolute left-0 right-0 top-[12.5%] border-t border-white/15" />
          <div className="pointer-events-none absolute bottom-0 top-[12.5%] left-1/2 border-l border-white/15" />

          <div className="relative grid min-h-[40rem] grid-rows-[1fr_7fr]">
            <div className="flex items-center px-6 py-5 sm:px-8">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
                  Before / After
                </div>
                <h1 className="mt-2 max-w-3xl font-display text-2xl tracking-[-0.04em] text-white sm:text-4xl">
                  {beforeAfter.headline}
                </h1>
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="flex flex-col justify-between px-6 py-6 sm:px-8 sm:py-8">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
                    Before
                  </div>
                  <p className="mt-3 max-w-md text-base leading-7 text-white/84 sm:text-lg">
                    {beforeAfter.beforeSummary}
                  </p>
                </div>

                <div className="space-y-3 pt-10">
                  {beforeAfter.contrastPairs.map((pair) => (
                    <div
                      key={`before-${pair.before}`}
                      className="border-t border-white/10 pt-3 text-sm leading-6 text-white/58"
                    >
                      {pair.before}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-between px-6 py-6 sm:px-8 sm:py-8">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
                    After
                  </div>
                  <p className="mt-3 max-w-md text-base leading-7 text-white sm:text-lg">
                    {beforeAfter.afterSummary}
                  </p>
                </div>

                <div className="space-y-3 pt-10">
                  {beforeAfter.contrastPairs.map((pair) => (
                    <div
                      key={`after-${pair.after}`}
                      className="border-t border-white/10 pt-3 text-sm leading-6 text-white/85"
                    >
                      {pair.after}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 flex flex-col gap-4 border border-white/10 bg-white/[0.03] px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
              First shift
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
              {beforeAfter.firstShift}
            </p>
          </div>

          <div className="flex gap-3">
            {plan.nextUnitId ? (
              <Button
                asChild
                className="h-10 rounded-none bg-white px-5 text-black hover:bg-white/90"
              >
                <Link href={beginHref}>Start the first shift</Link>
              </Button>
            ) : null}
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-none border-white/15 bg-transparent px-5 text-white hover:bg-white/5"
            >
              <Link href={workspaceHref}>Go to workspace</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
