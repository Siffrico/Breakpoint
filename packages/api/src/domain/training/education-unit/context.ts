// education-unit/context.ts
//
// The per-turn context block handed to a phase agent. Pure and side-effect
// free: it turns the durable state + unit material + learner signals into the
// single "## Context" message the orchestrator prepends to the transcript
// before calling a phase agent. It never talks to the model, DB, or Goldilocks.
//
// Two teaching directives are derived here rather than decided by the agents:
//   - micro-teach (solve): recoverable from post-transition state, because the
//     solveRepairs counter persists within the solve phase.
//   - teach-missed-connection (solve): NOT recoverable from state — the
//     connectGrills counter is reset the instant a forced connect->solve
//     advance happens (see fsm.ts). The orchestrator carries that one-shot
//     signal forward as `pendingConnectTeach`.

import type { UnitContent } from "../types/training.types";
import type { ScenarioSpecRecord } from "./scenario-spec";
import type { LoopPolicy, UnitState } from "./unit";
import {
  renderConnectGradingContext,
  renderEvalRubricContext,
  renderPriorSurfaceConstraint,
} from "./scenario-spec";

export interface UnitTurnContextInput {
  unit: Pick<
    UnitContent,
    | "title"
    | "learningGoal"
    | "whyItMatters"
    | "seedPrompt"
    | "seedHint"
    | "clusterArcFrame"
    | "unitMasteryContract"
  >;
  state: UnitState;
  policy: LoopPolicy;
  /** Learner memories, most-relevant first; only `content` is rendered. */
  memories: readonly { content: string }[];
  /**
   * Difficulty guidance resolved from Goldilocks by the orchestrator (both
   * passes READ difficulty). Null when no rating exists yet.
   */
  difficultyLine: string | null;
  /**
   * One-shot: the previous Connect was force-advanced after exhausting the
   * grill budget, so this Solve turn must teach the missed idea before posing
   * the problem. Only meaningful on a solve turn.
   */
  pendingConnectTeach: boolean;
  /**
   * The spec stored on the run, tagged with the pass it was recorded on
   * (untagged legacy rows count as pass 1). Drives the pass-2 transfer
   * constraint (teach/connect, pass-1 spec only), the active Connect grading
   * reference, and the eval grading reference. Null before a spec is recorded.
   */
  scenarioSpec: ScenarioSpecRecord | null;
  syllabus: {
    workflow: { name: string; steps: readonly string[] };
    checked: readonly { label: string; gloss: string }[];
    targets: readonly { id: string; label: string; gloss: string }[];
  } | null;
  /**
   * Set on recall interludes: the decayed skill this scenario must make the
   * learner retrieve and apply, plus an optional well-known companion skill
   * to compose with it. Recall never re-teaches — it poses one realistic
   * problem where the primary skill is load-bearing.
   */
  recallFocus?: {
    primary: { label: string; gloss: string };
    companion: { label: string; gloss: string } | null;
  } | null;
}

const bullet = (lines: readonly string[]): string =>
  lines.map((line) => `- ${line}`).join("\n");

/** The explicit per-turn output contract the solve agent looks for. */
const buildOutputContract = (input: UnitTurnContextInput): string | null => {
  const { state, policy, pendingConnectTeach } = input;
  const directives: string[] = [];

  if (pendingConnectTeach && state.phase === "solve") {
    directives.push(
      "The learner did not reconstruct the connection on their own and was advanced anyway. Before posing the solve problem, briefly teach the missed idea, anchored on their own last attempt.",
    );
  }

  if (
    state.phase === "solve" &&
    state.solveRepairs >= policy.maxRepairsBeforeMicroTeach
  ) {
    directives.push(
      "This turn should MICRO-TEACH before restating the problem: give one short worked example anchored on the learner's most recent wrong attempt, then ask them to try again.",
    );
  }

  return directives.length > 0
    ? `## Output contract\n${bullet(directives)}`
    : null;
};

/**
 * Takes the durable state and the unit material; produces the context block
 * prepended to a phase agent's transcript. Deterministic — the same inputs
 * always produce the same block, so it is trivially unit-testable.
 */
export const buildUnitTurnContext = (input: UnitTurnContextInput): string => {
  const { unit, state, memories, difficultyLine } = input;

  const sections: string[] = [
    `## Unit\nSkill: ${unit.title}\nLearning goal: ${unit.learningGoal}\nWhy it matters: ${unit.whyItMatters}`,
    `## Where we are\nPhase: ${state.phase} (pass ${state.pass} of 2)`,
    `## Scenario material\nSeed scenario: ${unit.seedPrompt}\nSeed hint (never reveal directly): ${unit.seedHint}`,
  ];

  if (unit.clusterArcFrame) {
    sections.push(`## How this unit fits\n${unit.clusterArcFrame}`);
  }

  if (input.syllabus) {
    const checked =
      input.syllabus.checked.length > 0
        ? bullet(
            input.syllabus.checked.map(
              (entry) => `${entry.label}: ${entry.gloss}`,
            ),
          )
        : "- None yet";
    const targets = bullet(
      input.syllabus.targets.map(
        (entry) => `${entry.id} — ${entry.label}: ${entry.gloss}`,
      ),
    );
    sections.push(
      `## Syllabus\nWorkflow: ${input.syllabus.workflow.name}\nSpine:\n${bullet(input.syllabus.workflow.steps)}\n\nAlready checked (assume known; build on these):\n${checked}\n\nThis unit must land:\n${targets}`,
    );
  }

  if (input.recallFocus) {
    const companion = input.recallFocus.companion
      ? `\nCompose it with this well-known skill (assume solid; no review needed): ${input.recallFocus.companion.label} — ${input.recallFocus.companion.gloss}`
      : "";
    sections.push(
      `## Recall focus\nThis is a spaced-recall checkpoint, not a lesson. Pose ONE realistic scenario in which the learner must retrieve and apply: ${input.recallFocus.primary.label} — ${input.recallFocus.primary.gloss}${companion}\nDo not re-teach the skill before they attempt it. Frame it briefly as a quick checkpoint before their next unit.`,
    );
  }

  if (difficultyLine) {
    sections.push(`## Difficulty\n${difficultyLine}`);
  }

  if (memories.length > 0) {
    sections.push(
      `## What we know about this learner\n${bullet(
        memories.map((memory) => memory.content),
      )}`,
    );
  }

  // Pass-2 use of the recorded spec, gated on WHICH pass recorded it:
  //   - connect sees pass 1's spec as a "vary the surface" constraint, or its
  //     pass-2 spec as the grading reference for the probe Teach already posed.
  //   - solve (the eval agent) only grades against pass 2's spec. Pass 1's
  //     canonical answer belongs to a different scenario; grading against it
  //     would score the learner on the wrong answer key, so it is never shown.
  if (input.scenarioSpec) {
    const specPass = input.scenarioSpec.pass ?? 1;
    if (state.phase === "teach" && specPass === 1) {
      sections.push(renderPriorSurfaceConstraint(input.scenarioSpec));
    } else if (
      state.pass === 2 &&
      state.phase === "connect" &&
      specPass === 1
    ) {
      sections.push(renderPriorSurfaceConstraint(input.scenarioSpec));
    } else if (
      state.pass === 2 &&
      state.phase === "connect" &&
      specPass === 2
    ) {
      sections.push(renderConnectGradingContext(input.scenarioSpec));
    } else if (state.pass === 2 && state.phase === "solve" && specPass === 2) {
      sections.push(renderEvalRubricContext(input.scenarioSpec));
    }
  }

  const outputContract = buildOutputContract(input);
  if (outputContract) {
    sections.push(outputContract);
  }

  return sections.join("\n\n");
};
