"use client";

import { useState } from "react";

import { MissionPlanCard } from "./mission-plan-card";

const mission = {
  title: "Make the release gate earn its confidence",
  hook: "Turn a vague ‘the evals look good’ claim into a release decision another engineer can audit.",
  estMinutes: 20,
  proofKind: "a release-gate memo",
};

const plan = {
  why: "A production eval is only useful when it changes what you ship. This mission trains you to connect a user-visible failure mode to a threshold, a rollback trigger, and an owner.",
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
      text: "Write the rollback signal, the first investigation step, and who makes the call when the signal trips.",
      done: false,
    },
  ],
  bringBack:
    "A short release-gate memo: failure mode, threshold, rollback signal, and the reasoning behind each decision.",
  sources: [],
};

export function MissionPreview() {
  const [started, setStarted] = useState(false);
  const [proof, setProof] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <main className="bg-background text-foreground min-h-dvh">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground font-mono text-xs tracking-[0.18em]">
            MISSION
          </p>
          <span className="border-border text-muted-foreground border px-2 py-1 text-[10px] font-medium tracking-[0.12em] uppercase">
            Preview data
          </span>
        </div>
        <p className="mt-5 text-lg leading-8">
          Your last eval caught obvious hallucinations, but it never tested
          whether the model confidently cited a stale policy. Today you are the
          engineer deciding whether that gap is safe to ship.
        </p>

        <div className="mt-6">
          <MissionPlanCard
            spec={mission}
            plan={plan}
            readOnly={started}
            onStart={() => setStarted(true)}
            onConsult={() => setStarted(true)}
          />
        </div>

        {started ? (
          <section className="border-border mt-6 border-t pt-5">
            {submitted ? (
              <div className="border-border bg-card border p-6">
                <p className="text-lg">✓ Mission proof captured</p>
                <p className="text-muted-foreground mt-3 text-sm leading-6">
                  In the product, your coach would now challenge the tradeoffs
                  in your release gate before closing the loop.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm">Draft your release-gate memo.</p>
                <textarea
                  value={proof}
                  onChange={(event) => setProof(event.target.value)}
                  placeholder="Failure mode: stale policy citations…"
                  className="border-border mt-3 min-h-36 w-full border bg-transparent p-3 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={!proof.trim()}
                  onClick={() => setSubmitted(true)}
                  className="bg-foreground text-background mt-3 rounded-full px-4 py-2 text-sm disabled:opacity-40"
                >
                  Send proof
                </button>
              </>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
