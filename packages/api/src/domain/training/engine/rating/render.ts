import type { ScenarioFormat } from "@acme/validators";

import type { RatingPredictionRecord } from "./apply-evaluation";
import type { DifficultyBand, ScenarioDirective } from "./decide";
import type { DifficultyDialPreset } from "./difficulty-priors";
import type { SupportLevel } from "./policy";

/**
 * Directive → prompt block. This is the translation layer between the
 * deterministic controller (which speaks numbers) and the scenario generator
 * (which cannot reliably hit "1180" but can execute concrete difficulty
 * moves). The vocabulary below is the difficulty rubric: every step harder or
 * easier is defined as operational moves, never "make it harder".
 *
 * Pure string assembly — safe to call anywhere, including prompt builders.
 */

const SUPPORT_INSTRUCTIONS: Record<SupportLevel, string> = {
  worked_example:
    "Begin with a fully worked example of the same problem schema (different surface context), then pose the scenario. The learner should see the reasoning pattern before attempting it.",
  guided:
    "Pose the scenario with its structure made visible: name the steps or decision points the learner must work through, but do not solve any of them.",
  none: "Pose the bare scenario. No worked example, no step breakdown, no structural cues — the learner must recognise the problem schema unaided.",
};

const INTENT_INSTRUCTIONS: Record<ScenarioDirective["intent"], string> = {
  repair:
    "This is a remediation scenario. Engineer it so the targeted misconception, if still held, produces a specific wrong answer — the distractor must be the natural conclusion of the flawed reasoning, and the correct path must hinge on the exact cue the misconception ignores.",
  probe:
    "This is a calibration probe. Make it a clean, representative instance of the problem schema at the stated difficulty — no unusual twists, no engineered distractors. Its job is to measure, not to teach.",
  back_off:
    "The learner just failed hard. Reduce cognitive load without changing the underlying schema: familiar surface context, one fewer compounded step, no time pressure framing.",
  promote:
    "First scenario of a harder band. Introduce exactly one new source of difficulty relative to the previous band (per the band definition) and keep every other axis gentle — the support level above carries the load.",
  fade_support:
    "Same difficulty as recent scenarios, but with the reduced scaffolding stated above. Do not compensate by making the problem itself easier.",
  challenge:
    "Standard training scenario in the Goldilocks zone (~70% expected success). Vary the surface context away from recently used ones; keep difficulty axes consistent with the target rating.",
  mastered:
    "The job is mastered. If a scenario is still requested, generate a celebratory full-difficulty scenario with no support.",
};

/**
 * Calibration feedback for the generator, computed by the caller from the
 * decision log (e.g. "your last 5 scenarios claimed ~1150 and were beaten
 * 90% of the time"). Optional — omit until enough data exists.
 */
export interface GeneratorCalibrationNote {
  readonly note: string;
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export const buildGeneratorCalibrationNote = (
  predictions: readonly Pick<
    RatingPredictionRecord,
    "predictedScore" | "actualOutcome"
  >[],
): GeneratorCalibrationNote | undefined => {
  const window = predictions.slice(-8);
  if (window.length < 4) return undefined;

  const predicted = mean(window.map((prediction) => prediction.predictedScore));
  const actual = mean(window.map((prediction) => prediction.actualOutcome));
  const gap = actual - predicted;
  if (Math.abs(gap) <= 0.1) return undefined;

  return {
    note:
      gap > 0
        ? `Recent scenarios are being beaten more often than predicted (${Math.round(predicted * 100)}% predicted vs ${Math.round(actual * 100)}% actual). Prefer the upper ends of the assigned structural ranges.`
        : `Recent scenarios are being beaten less often than predicted (${Math.round(predicted * 100)}% predicted vs ${Math.round(actual * 100)}% actual). Prefer the lower ends of the assigned structural ranges.`,
  };
};

/**
 * Render a directive into the instruction block appended to the scenario
 * generator's context. Takes the directive and its band, produces a prompt
 * fragment, and fails only when the directive's band was not supplied —
 * which means the caller resolved the band ladder inconsistently.
 */
export const renderScenarioDirective = (
  directive: ScenarioDirective,
  band: DifficultyBand,
  format: ScenarioFormat,
  dialPreset: DifficultyDialPreset,
  calibration?: GeneratorCalibrationNote,
): string => {
  if (band.order !== directive.bandOrder) {
    throw new RangeError(
      `directive targets band ${directive.bandOrder} but band ${band.order} was supplied`,
    );
  }

  const lines = [
    "## Difficulty directive (set by the training engine — follow exactly)",
    `- Intent: ${directive.intent}`,
    `- Band: ${band.order}${band.label ? ` (${band.label})` : ""}, rating range ${band.minRating}-${band.maxRating}`,
    `- Format: ${format.label} (${format.kind}, id: ${format.id}). ${format.description}`,
    `- Reasoning path: ${dialPreset.steps[0]}–${dialPreset.steps[1]} steps; list each step in reasoningPathSteps.`,
    `- Withhold ${dialPreset.withheldGivens[0]}–${dialPreset.withheldGivens[1]} key givens; name each in withheldGivens.`,
    `- Embed ${dialPreset.alternatives[0]}–${dialPreset.alternatives[1]} plausible wrong approaches; name each in embeddedAlternatives.`,
    `- Support: ${SUPPORT_INSTRUCTIONS[directive.supportLevel]}`,
  ];

  if (directive.targetMisconceptionCode) {
    lines.push(
      `- Target misconception: ${directive.targetMisconceptionCode}. ${INTENT_INSTRUCTIONS.repair}`,
    );
  } else {
    lines.push(`- Approach: ${INTENT_INSTRUCTIONS[directive.intent]}`);
  }

  lines.push(`- Why (shown to the learner): ${directive.reason}`);

  if (calibration) {
    lines.push(`- Calibration: ${calibration.note}`);
  }

  return lines.join("\n");
};
