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
import type { LoopPolicy, PassIndex, UnitState } from "./unit";
import {
  renderConnectGradingContext,
  renderEvalRubricContext,
  renderScenarioEvolutionConstraint,
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
  /** Total rounds in this run's recipe (v1: 2, v2: 3, recall: 2). */
  passes: PassIndex;
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
    /**
     * `mechanism` is the concept's falsifiable causal claim ("X under Y causes
     * Z"), authored by the syllabus designer specifically so a scenario can be
     * built from that sentence alone. Backwards authoring tells the posing
     * agent to take the chasm from these lines, so they must reach the prompt —
     * a target rendered as label+gloss only leaves the model to re-invent the
     * claim from a three-word label. Null on pre-v2 entries.
     */
    targets: readonly {
      id: string;
      label: string;
      gloss: string;
      mechanism: string | null;
    }[];
  } | null;
  /**
   * Set on recall interludes: the decayed skill this scenario must make the
   * learner retrieve and apply, plus an optional well-known companion skill
   * to compose with it. Recall never re-teaches — it poses one realistic
   * problem where the primary skill is load-bearing.
   */
  recallFocus?: {
    primary: { label: string; gloss: string };
    companion: {
      label: string;
      gloss: string;
      /**
       * How the companion's situation chains with the primary's: "setup"
       * opens the scenario a stage earlier and hands off to the target,
       * "continuation" carries it a stage past the target, "peer" shares
       * the target's own situation.
       */
      relation: "setup" | "continuation" | "peer";
    } | null;
  } | null;
}

const bullet = (lines: readonly string[]): string =>
  lines.map((line) => `- ${line}`).join("\n");

/** The explicit per-turn output contract the solve agent looks for. */
const buildOutputContract = (input: UnitTurnContextInput): string | null => {
  const { state, policy, passes, pendingConnectTeach } = input;
  const directives: string[] = [];

  if (pendingConnectTeach && state.phase === "solve") {
    directives.push(
      "The learner did not reconstruct the connection on their own and was advanced anyway. Before posing the solve problem, briefly teach the missed idea, anchored on their own last attempt.",
    );
  }

  // v2 connect loop: the grill budget is spent but the phase keeps looping —
  // escalate to a teach of the missing idea, then re-pose the SAME scenario.
  // Driven by the explicit one-shot marker (armed by the failing grade,
  // consumed by the turn that delivers the teach — see fsm.ts), so the
  // directive can never fire again on the learner's post-teach answer.
  if (state.phase === "connect" && state.connectTeachDue) {
    directives.push(
      "The learner has repeatedly missed the core connection. This turn, briefly TEACH the missing idea — anchored on their own attempts, smallest possible reveal — then re-pose the same scenario's reconstruct questions so they can genuinely connect. Do not grade this turn as connected on your teaching; only on their own reconstruction.",
    );
  }

  if (state.phase === "solve" && state.pass === passes) {
    directives.push(
      "This is the unit's FINAL round: on a passing answer, also call checkOffSyllabus with only the target entry ids the learner directly demonstrated.",
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
    `## Where we are\nPhase: ${state.phase} (round ${state.pass} of ${input.passes})`,
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
    // The mechanism goes on its own indented line rather than inline: it is the
    // sentence the scenario's chasm must instantiate, so it has to read as the
    // concept's definition, not as a trailing clause on the gloss.
    const targets = input.syllabus.targets
      .map((entry) => {
        const head = `- ${entry.id} — ${entry.label}: ${entry.gloss}`;
        return entry.mechanism
          ? `${head}\n    mechanism: ${entry.mechanism}`
          : head;
      })
      .join("\n");
    sections.push(
      `## Syllabus\nWorkflow: ${input.syllabus.workflow.name}\nSpine:\n${bullet(input.syllabus.workflow.steps)}\n\nAlready checked (assume known; build on these):\n${checked}\n\nThis unit must land:\n${targets}`,
    );
  }

  if (input.recallFocus) {
    // Chained companions make the scenario one continuous whole task — the
    // learner walks through the well-known stage on the way to the decayed one
    // — instead of two unrelated facts stapled into one prompt.
    const companionFraming: Record<
      NonNullable<
        NonNullable<UnitTurnContextInput["recallFocus"]>["companion"]
      >["relation"],
      string
    > = {
      setup:
        "Open the scenario one stage earlier, inside this well-known skill, and let it hand off naturally to the target skill",
      continuation:
        "Let the scenario flow one stage past the target skill, into this well-known skill",
      peer: "Compose it with this well-known skill from the same situation",
    };
    const companion = input.recallFocus.companion
      ? `\n${companionFraming[input.recallFocus.companion.relation]} (assume solid; no review needed): ${input.recallFocus.companion.label} — ${input.recallFocus.companion.gloss}`
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

  // Use of the recorded spec, gated on WHICH round recorded it:
  //   - teach sees the just-finished round's spec as the evolution constraint
  //     (same world, escalated friction; the final round adds the transfer
  //     mutation).
  //   - connect sees the prior round's spec as the evolution constraint
  //     (safety net when no seam teach recorded one), or the current round's
  //     spec as the grading reference for the already-posed scenario — on
  //     EVERY round, including round one, where Connect itself recorded the
  //     spec while posing. Whether the spec is "current" or "prior" is decided
  //     once, from its pass tag alone.
  //   - solve (the evaluator) only grades against the current round's spec. A
  //     prior round's canonical answer belongs to an earlier form of the
  //     scenario; grading against it would score the learner on the wrong
  //     answer key, so it is never shown.
  if (input.scenarioSpec) {
    const specPass = input.scenarioSpec.pass ?? 1;
    const isFinalRound = state.pass >= input.passes;
    if (state.phase === "teach" && specPass === state.pass) {
      sections.push(
        renderScenarioEvolutionConstraint(input.scenarioSpec, {
          // The seam teach evolves INTO the next round.
          isFinalRound: state.pass + 1 >= input.passes,
        }),
      );
    } else if (state.phase === "connect" && specPass === state.pass - 1) {
      sections.push(
        renderScenarioEvolutionConstraint(input.scenarioSpec, {
          isFinalRound,
        }),
      );
    } else if (state.phase === "connect" && specPass === state.pass) {
      sections.push(renderConnectGradingContext(input.scenarioSpec));
    } else if (state.phase === "solve" && specPass === state.pass) {
      sections.push(renderEvalRubricContext(input.scenarioSpec));
    }
  }

  const outputContract = buildOutputContract(input);
  if (outputContract) {
    sections.push(outputContract);
  }

  return sections.join("\n\n");
};
