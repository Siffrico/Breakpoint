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
import type { LoopPolicy, UnitState } from "./unit";

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
  /** Compacted running summary of earlier turns, or null on the first turn. */
  progressSummary: string | null;
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
  syllabus: {
    workflow: { name: string; steps: readonly string[] };
    checked: readonly { label: string; gloss: string }[];
    targets: readonly { id: string; label: string; gloss: string }[];
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
  const { unit, state, memories, progressSummary, difficultyLine } = input;

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

  if (difficultyLine) {
    sections.push(`## Difficulty\n${difficultyLine}`);
  }

  if (progressSummary) {
    sections.push(`## Progress so far\n${progressSummary}`);
  }

  if (memories.length > 0) {
    sections.push(
      `## What we know about this learner\n${bullet(
        memories.map((memory) => memory.content),
      )}`,
    );
  }

  const outputContract = buildOutputContract(input);
  if (outputContract) {
    sections.push(outputContract);
  }

  return sections.join("\n\n");
};
