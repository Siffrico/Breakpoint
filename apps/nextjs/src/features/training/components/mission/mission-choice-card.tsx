"use client";

import { motion } from "motion/react";

import type { MissionSpec } from "@acme/validators";

import { missionMotion } from "./animation";

export function MissionChoiceCards({
  missions,
  onPick,
  onOther,
}: {
  missions: MissionSpec[];
  onPick: (mission: MissionSpec) => void;
  onOther: () => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      {missions.map((mission, index) => (
        <motion.button
          layoutId={`mission-${index}`}
          transition={missionMotion}
          key={mission.title}
          type="button"
          onClick={() => onPick(mission)}
          className="w-full rounded-lg border border-[var(--site-line)] bg-[var(--site-raised)] px-4 py-3.5 text-left outline-none transition-colors hover:border-[var(--site-line-strong)]"
        >
          <p className="text-[14px] font-medium text-[var(--site-fg)]">
            {mission.title}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--site-text-2)]">
            {mission.hook}
          </p>
          <p className="mt-2.5 font-mono text-[11px] tracking-[0.03em] text-[var(--site-text-3)]">
            ~{mission.estMinutes}m · bring {mission.proofKind}
          </p>
        </motion.button>
      ))}
      <button
        type="button"
        onClick={onOther}
        className="mt-2 self-start text-[13px] text-[var(--site-text-2)] underline-offset-[3px] outline-none transition-colors hover:text-[var(--site-fg)] hover:underline"
      >
        Do something else
      </button>
    </section>
  );
}
