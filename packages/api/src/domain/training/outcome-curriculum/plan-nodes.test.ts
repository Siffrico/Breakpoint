import { describe, expect, it } from "vitest";

import { buildOutcomeNodes } from "./plan-nodes";

const build = () =>
  buildOutcomeNodes({
    targetIdentity: "SAT test-taker",
    summary: "Reach the learner's target SAT Math performance.",
    outcomes: [
      {
        title: "Algebra",
        result: "Solve SAT Algebra questions accurately across official forms.",
      },
      {
        title: "Advanced Math",
        result:
          "Solve SAT Advanced Math questions accurately across official forms.",
      },
    ],
  });

describe("buildOutcomeNodes", () => {
  it("persists the learner-confirmed outcomes without compiling them", () => {
    const [root, first, second] = build();

    expect(root?.kind).toBe("root");
    expect(first).toMatchObject({
      kind: "outcome",
      title: "Algebra",
      outcomeResult:
        "Solve SAT Algebra questions accurately across official forms.",
      status: "ready",
      skillMap: null,
      practiceContract: null,
    });
    expect(second?.status).toBe("planned");
  });

  it("creates only root and outcome nodes", () => {
    expect(build().map((node) => node.kind)).toEqual([
      "root",
      "outcome",
      "outcome",
    ]);
  });
});
