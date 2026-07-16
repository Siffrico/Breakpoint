"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { AnimatePresence, domMax, LazyMotion, m } from "motion/react";

import type { MissionPlan, MissionSpec } from "@acme/validators";
import { Button } from "@acme/ui/button";

import { missionMotion } from "./animation";
import { ConsultSheet } from "./consult-sheet";
import { MissionPlanCard } from "./mission-plan-card";
import { ProofComposer } from "./proof-composer";

/**
 * Two pages. Pick: "Missions:" + three title-only pills + Start +
 * "something else" (consult sheet). Run: the checklist + proof composer.
 */

type Page = "pick" | "run";

const missions: MissionSpec[] = [
  {
    title: "Make the release gate earn its confidence",
    hook: "Turn a vague ‘the evals look good’ claim into a release decision another engineer can audit.",
    estMinutes: 20,
    proofKind: "a release-gate memo",
  },
  {
    title: "Break your own eval before production does",
    hook: "Find one failure your current eval provably cannot see, and show the query that slips through.",
    estMinutes: 25,
    proofKind: "a failing example with a one-line diagnosis",
  },
  {
    title: "Write the rollback you wish you had last incident",
    hook: "Define the signal, the first investigation step, and the owner — before anything is on fire.",
    estMinutes: 15,
    proofKind: "a rollback runbook entry",
  },
];

const planFor = (spec: MissionSpec): MissionPlan => ({
  why: "",
  steps: [
    {
      text: "Pick one high-cost user failure the current eval could miss, and name the evidence that would reveal it.",
      done: false,
    },
    {
      text: "Set a release threshold and explain why it is strict enough for this failure but not so strict that it blocks learning.",
      done: false,
    },
    {
      text: `Write it up as ${spec.proofKind} another engineer could act on without asking you anything.`,
      done: false,
    },
  ],
  bringBack: "",
  sources: [],
});

export function MissionPreview() {
  const [page, setPage] = useState<Page>("pick");
  const [selected, setSelected] = useState<MissionSpec | null>(null);
  const [consultOpen, setConsultOpen] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <LazyMotion features={domMax}>
      <main className="bp-site min-h-dvh w-full">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={sent ? "done" : page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={missionMotion}
            className={
              page === "pick"
                ? "mx-auto w-full max-w-[560px] px-6 py-16"
                : "flex min-h-dvh flex-col"
            }
          >
            {page === "pick" ? (
              <>
                <h1 className="text-[25px] leading-[1.2] font-medium tracking-[-0.02em] text-[var(--site-fg)]">
                  Missions:
                </h1>

                <div className="mt-8 flex flex-col gap-2.5">
                  {missions.map((mission) => {
                    const isSelected = selected?.title === mission.title;
                    return (
                      <button
                        key={mission.title}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelected(mission)}
                        className={`bg-card w-full rounded-lg border px-5 py-4 text-left text-[14px] leading-relaxed transition-colors outline-none ${
                          isSelected
                            ? "border-[var(--site-line-strong)] text-[var(--site-fg)]"
                            : "border-border text-[var(--site-text-2)] hover:text-[var(--site-fg)]"
                        }`}
                      >
                        {mission.title}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <Button
                    type="button"
                    disabled={!selected}
                    onClick={() => setPage("run")}
                    className="w-28 [--primary:var(--site-cta)]"
                  >
                    Start
                  </Button>

                  <button
                    type="button"
                    onClick={() => setConsultOpen(true)}
                    className="text-[14px] text-[var(--site-text-2)] underline underline-offset-[3px] transition-colors outline-none hover:text-[var(--site-fg)]"
                  >
                    something else
                  </button>
                </div>
              </>
            ) : sent ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <h1 className="text-[25px] leading-[1.2] font-medium tracking-[-0.02em] text-[var(--site-fg)]">
                  Mission completed
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-[var(--site-text-2)]">
                  Eval judgment has been mastered.{" "}
                  <Link
                    href="/workspace"
                    className="inline-flex items-center gap-1 text-[var(--site-fg)] underline underline-offset-[3px] transition-opacity outline-none hover:opacity-80"
                  >
                    move on to next
                    <ArrowRight className="size-3.5" />
                  </Link>
                </p>
              </div>
            ) : selected ? (
              <>
                <div className="flex flex-1 items-center justify-center px-6">
                  <div className="w-full max-w-[560px]">
                    <MissionPlanCard
                      spec={selected}
                      plan={planFor(selected)}
                      readOnly
                    />
                  </div>
                </div>
                <div className="mx-auto w-full max-w-[720px] px-6 pb-8">
                  <ProofComposer onSubmit={() => setSent(true)} />
                </div>
              </>
            ) : null}
          </m.div>
        </AnimatePresence>

        <ConsultSheet
          open={consultOpen}
          onClose={() => setConsultOpen(false)}
          onSend={() => setConsultOpen(false)}
        />
      </main>
    </LazyMotion>
  );
}
