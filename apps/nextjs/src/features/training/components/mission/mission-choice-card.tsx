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
    <section className="space-y-3">
      {missions.map((mission, index) => (
        <motion.article
          layoutId={`mission-${index}`}
          transition={missionMotion}
          key={mission.title}
          className="border-border bg-card border p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">
                {index + 1}. {mission.title}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {mission.hook}
              </p>
              <p className="text-muted-foreground mt-3 text-xs">
                ~{mission.estMinutes}m · bring {mission.proofKind}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onPick(mission)}
              className="bg-foreground text-background shrink-0 rounded-full px-3 py-2 text-sm"
            >
              Pick
            </button>
          </div>
        </motion.article>
      ))}
      <button
        type="button"
        onClick={onOther}
        className="text-muted-foreground text-sm underline"
      >
        ↻ Do something else
      </button>
    </section>
  );
}
