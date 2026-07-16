"use client";

import { m } from "motion/react";

import type { MissionPlan, MissionSpec } from "@acme/validators";
import { Button } from "@acme/ui/button";

import { missionMotion } from "./animation";

/**
 * Two postures: interactive (the commitment screen — full pitch, raised step
 * cards, one primary action) and readOnly (the mission is live — the brief
 * recedes to a quiet checklist so the proof composer is the focal element).
 */
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
  if (readOnly) {
    return (
      <m.section layout transition={missionMotion}>
        <h1 className="text-[19px] leading-[1.3] font-medium tracking-[-0.01em] text-[var(--site-fg)]">
          {spec.title}
        </h1>
        <ul className="mt-4">
          {plan.steps.map((step) => (
            <li
              key={step.text}
              className="flex items-baseline gap-3.5 border-b border-[var(--site-line)] py-3 last:border-0"
            >
              <span className="font-mono text-[12px] text-[var(--site-text-3)]">
                {step.done ? "■" : "□"}
              </span>
              <span className="text-[14px] leading-relaxed text-[var(--site-text-2)]">
                {step.text}
              </span>
            </li>
          ))}
        </ul>
      </m.section>
    );
  }

  return (
    <m.section layout transition={missionMotion}>
      <h1 className="text-[25px] leading-[1.2] font-medium tracking-[-0.02em] text-[var(--site-fg)]">
        {spec.title}
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[var(--site-text-2)]">
        {plan.why}
      </p>

      <ol className="mt-8 flex flex-col gap-2.5">
        {plan.steps.map((step, index) => (
          <li
            key={step.text}
            className="flex items-baseline gap-3.5 rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)] px-4 py-3.5"
          >
            <span className="font-mono text-[12px] text-[var(--site-text-3)]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-[14px] leading-relaxed text-[var(--site-fg)]">
              {step.text}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-[14px] leading-relaxed text-[var(--site-text-2)]">
        <span className="font-medium text-[var(--site-fg)]">Bring back </span>
        {plan.bringBack}
      </p>
      {plan.sources.length ? (
        <p className="mt-2 font-mono text-[11px] tracking-[0.03em] text-[var(--site-text-3)]">
          Uses: {plan.sources.join(" · ")}
        </p>
      ) : null}

      <div className="mt-9 flex flex-col gap-4">
        <Button
          type="button"
          size="lg"
          onClick={onStart}
          className="w-full border-[var(--site-line)]"
        >
          Start mission
        </Button>
        <button
          type="button"
          onClick={onConsult}
          className="text-center text-[14px] text-[var(--site-text-2)] underline-offset-[3px] transition-colors outline-none hover:text-[var(--site-fg)] hover:underline"
        >
          Ask / tweak
        </button>
      </div>
    </m.section>
  );
}
