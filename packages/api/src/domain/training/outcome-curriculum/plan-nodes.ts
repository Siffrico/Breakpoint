// outcome-curriculum/plan-nodes.ts
//
// The topic-mode plan tree: root → outcome. Units are appended beneath an
// outcome by the progression engine as the learner earns them, never authored
// here — the same contract curriculum-flow.ts holds for ability mode.
//
// Built from pass A only. Every node written here is a complete, valid,
// rateable node; what it lacks is the teaching blueprint, which pass B adds in
// place when the outcome comes up. See outcome-curriculum/contracts.ts.
//
// Pure: draft in, node blueprints out. No database, no clock, no randomness.

import type { OutcomeOrdering } from "@acme/validators";

import type { CurriculumNodeBlueprint } from "../types/training.types";
import type { OutcomePlanDraft } from "./contracts";
import { deriveCanonicalDifficultyBands } from "../engine/rating";
import { ARCHETYPE_FORMATS } from "../engine/scenario-archetypes";

/**
 * Which outcomes are unlocked at build time.
 *
 *   sequential  — only the first. Mastering it unlocks the next (see
 *                 progression.ts planOutcomeAdvancement).
 *   interleaved — all of them, because the learner is meant to meet tasks from
 *                 any of them from the start.
 *
 * Exported for the progression engine, which must agree with this on what
 * "unlocked" means or a plan could end up with no reachable frontier.
 */
export const isUnlockedAtBuild = (
  outcomeIndex: number,
  ordering: OutcomeOrdering,
): boolean => ordering === "interleaved" || outcomeIndex === 0;

export const buildOutcomeNodes = (
  draft: OutcomePlanDraft,
  targetIdentity: string,
  headline: string,
): CurriculumNodeBlueprint[] => {
  const centerColumn = Math.floor((draft.outcomes.length - 1) / 2);
  const nodes: CurriculumNodeBlueprint[] = [
    {
      parentOrderIndex: null,
      kind: "root",
      status: "completed",
      title: targetIdentity,
      summary: headline,
      whyItMatters:
        "This path exists because of what mastering this topic means to the learner.",
      learningGoal:
        "Reach every outcome below and the topic is mastered as the learner defined it.",
      orderIndex: 0,
      depth: 0,
      positionColumn: centerColumn,
      positionRow: 0,
      difficultyBands: null,
      abilityStage: null,
      skillMap: null,
    },
  ];

  for (const [outcomeIndex, outcome] of draft.outcomes.entries()) {
    const difficultyBands = [
      ...deriveCanonicalDifficultyBands(
        ARCHETYPE_FORMATS[outcome.scenarioArchetype],
      ),
    ];
    const easiestBand = difficultyBands[0];
    const hardestBand = difficultyBands.at(-1);
    if (!easiestBand || !hardestBand) {
      throw new RangeError("Canonical difficulty bands must not be empty.");
    }

    nodes.push({
      parentOrderIndex: 0,
      kind: "outcome",
      status: isUnlockedAtBuild(outcomeIndex, draft.ordering)
        ? "ready"
        : "planned",
      title: outcome.title,
      summary: outcome.summary,
      whyItMatters: outcome.whyItMatters,
      learningGoal: outcome.masteryContract.exitCriteria.join(" "),
      orderIndex: outcomeIndex + 1,
      depth: 1,
      positionColumn: outcomeIndex,
      positionRow: 1,
      difficultyBands,
      // Outcome nodes run one regime for their whole life, so they carry no
      // stage. The database CHECK enforces this.
      abilityStage: null,
      skillMap: {
        workflow: outcome.workflow,
        // The full climb: an outcome has no foundation phase to calibrate
        // against, so it ramps from the easiest band to the hardest.
        bandRamp: {
          startRating: easiestBand.maxRating,
          peakRating: hardestBand.maxRating,
        },
        masteryContract: outcome.masteryContract,
        scenarioArchetype: outcome.scenarioArchetype,
        mainOutcome: outcome.mainOutcome,
        // scenarioBrief and blueprint are deliberately absent: pass B writes
        // them onto this skill map the first time the outcome is taught. Their
        // absence IS the "not yet blueprinted" signal the warm path reads —
        // there is no second flag to fall out of sync with.
      },
    });
  }

  return nodes;
};
