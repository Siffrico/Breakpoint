"use client";

import { motion } from "motion/react";

import type { MissionPlan, MissionSpec } from "@acme/validators";

import { missionMotion } from "./animation";

export function MissionPlanCard({
  spec,
  plan,
  readOnly = false,
  onStart,
  onConsult,
}: {
  spec: MissionSpec;
  plan: MissionPlan;
  readOnly?: boolean;
  onStart?: () => void;
  onConsult?: () => void;
}) {
  return (
    <motion.section
      layout
      transition={missionMotion}
      className="border-border bg-card border p-6"
    >
      <p className="text-muted-foreground text-xs tracking-[0.18em]">MISSION</p>
      <h1 className="font-display mt-2 text-2xl">🎯 {spec.title}</h1>
      <p className="text-muted-foreground mt-4 text-sm leading-6">{plan.why}</p>
      <ol className="mt-5 space-y-3">
        {plan.steps.map((step, index) => (
          <li key={step.text} className="flex gap-3 text-sm">
            <span>{readOnly ? "□" : `${index + 1}.`}</span>
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm">
        <span className="text-muted-foreground">Bring back </span>
        {plan.bringBack}
      </p>
      {plan.sources.length ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Uses: {plan.sources.join(" · ")}
        </p>
      ) : null}
      {!readOnly ? (
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onStart}
            className="bg-foreground text-background rounded-full px-4 py-2 text-sm"
          >
            ✓ Start mission
          </button>
          <button
            type="button"
            onClick={onConsult}
            className="text-sm underline"
          >
            Ask / tweak
          </button>
        </div>
      ) : null}
    </motion.section>
  );
}
