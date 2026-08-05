import { describe, expect, it } from "vitest";

import type { OutcomeOrdering } from "@acme/validators";

import type { OutcomeDraft, OutcomePlanDraft } from "./contracts";
import { buildOutcomeNodes, isUnlockedAtBuild } from "./plan-nodes";

const outcome = (title: string): OutcomeDraft => ({
  title,
  mainOutcome: `A defensible answer for ${title}, justified from the passage.`,
  summary: `Tasks in ${title}.`,
  whyItMatters: `${title} is a graded section.`,
  workflow: {
    name: `Solve one ${title} item`,
    steps: [
      "Read for the constraint the context imposes.",
      "Predict the meaning the constraint requires.",
      "Test each option against that constraint.",
    ],
  },
  scenarioArchetype: "select",
  scenarioArchetypeWhy: "The SAT is a selected-response instrument.",
  scenarioBrief: {
    taskShape: "One short passage, one blank, four lettered options.",
    qualityBar: ["Exactly one option survives the stated constraint."],
    variationAxes: ["Constraint carried by a contrast word."],
    neverDo: ["No vocabulary the constraint cannot disambiguate."],
  },
  masteryContract: {
    exitCriteria: [`Answers ${title} items correctly at the top band.`],
  },
});

const draft = (
  titles: string[],
  ordering: OutcomeOrdering = "sequential",
): OutcomePlanDraft => ({
  title: "sat",
  summary: "Every question type, at any difficulty.",
  ordering,
  orderingWhy: "Nobody mistakes a grid-in for a reading item.",
  outcomes: titles.map(outcome),
});

const build = (titles: string[], ordering: OutcomeOrdering = "sequential") =>
  buildOutcomeNodes(draft(titles, ordering), "SAT test-taker", "Every type.");

describe("isUnlockedAtBuild", () => {
  it("opens only the first outcome when sequential", () => {
    expect(isUnlockedAtBuild(0, "sequential")).toBe(true);
    expect(isUnlockedAtBuild(1, "sequential")).toBe(false);
  });

  it("opens every outcome when interleaved", () => {
    expect(isUnlockedAtBuild(0, "interleaved")).toBe(true);
    expect(isUnlockedAtBuild(4, "interleaved")).toBe(true);
  });
});

describe("buildOutcomeNodes", () => {
  it("produces a root plus one outcome node each, and no skill layer", () => {
    const nodes = build(["Craft and Structure", "Algebra"]);

    expect(nodes.map((planNode) => planNode.kind)).toEqual([
      "root",
      "outcome",
      "outcome",
    ]);
    expect(nodes.every((planNode) => planNode.depth <= 1)).toBe(true);
  });

  it("parents every outcome to the root and keeps order indexes unique", () => {
    const nodes = build(["a", "b", "c"]);
    const outcomes = nodes.filter((planNode) => planNode.kind === "outcome");

    expect(outcomes.every((planNode) => planNode.parentOrderIndex === 0)).toBe(
      true,
    );
    expect(new Set(nodes.map((planNode) => planNode.orderIndex)).size).toBe(
      nodes.length,
    );
  });

  it("gates a sequential plan to one ready frontier", () => {
    const statuses = build(["a", "b", "c"])
      .filter((planNode) => planNode.kind === "outcome")
      .map((planNode) => planNode.status);

    expect(statuses).toEqual(["ready", "planned", "planned"]);
  });

  it("opens every outcome in an interleaved plan", () => {
    const statuses = build(["a", "b", "c"], "interleaved")
      .filter((planNode) => planNode.kind === "outcome")
      .map((planNode) => planNode.status);

    expect(statuses).toEqual(["ready", "ready", "ready"]);
  });

  it("carries the main outcome and brief onto the node's skill map", () => {
    const [, first] = build(["Craft and Structure"]);

    expect(first?.skillMap?.mainOutcome).toContain("Craft and Structure");
    expect(first?.skillMap?.scenarioBrief?.taskShape).toContain(
      "four lettered",
    );
    expect(first?.skillMap?.scenarioArchetype).toBe("select");
  });

  it("ramps across the full band ladder, with no foundation calibration span", () => {
    const [, first] = build(["a"]);
    const bands = first?.difficultyBands ?? [];
    const ramp = first?.skillMap?.bandRamp;

    expect(bands.length).toBeGreaterThan(1);
    expect(ramp?.startRating).toBe(bands[0]?.maxRating);
    expect(ramp?.peakRating).toBe(bands.at(-1)?.maxRating);
  });

  it("leaves the ability stage null, as the node table's shape check requires", () => {
    expect(
      build(["a", "b"]).every((planNode) => planNode.abilityStage === null),
    ).toBe(true);
  });

  it("gives the root no skill map and every outcome one", () => {
    const [root, ...outcomes] = build(["a", "b"]);

    expect(root?.skillMap).toBeNull();
    expect(outcomes.every((planNode) => planNode.skillMap !== null)).toBe(true);
  });
});
