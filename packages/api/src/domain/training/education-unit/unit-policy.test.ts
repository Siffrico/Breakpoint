import { describe, expect, it } from "vitest";

import type {
  UnitDiagnosisCause,
  UnitPart,
  UnitRoundSpec,
  UnitStep,
} from "@acme/validators";

import { nextMove } from "./unit-policy";

const UNIT_CRITERIA = ["c1", "c2"];

const learnSpec = (criterionIds = UNIT_CRITERIA): UnitRoundSpec => ({
  label: "learn",
  pacing: "part_by_part",
  partCount: 3,
  rated: false,
  mustPass: false,
  criterionIds,
});

const examSpec = (criterionIds = UNIT_CRITERIA): UnitRoundSpec => ({
  label: "exam",
  pacing: "all_at_once",
  partCount: 3,
  rated: true,
  mustPass: true,
  criterionIds,
});

const part = ({
  criterionIds = ["c1"],
  missed = [],
  graded = true,
  cause = "wrong-rule",
}: {
  criterionIds?: string[];
  missed?: string[];
  graded?: boolean;
  cause?: UnitDiagnosisCause;
} = {}): UnitPart => {
  const met = missed.length === 0;
  return {
    question: "What changes?",
    criterionIds,
    verifier: {
      kind: "checks",
      checks: criterionIds.map((criterionId) => ({
        criterionId,
        check: "Names the change.",
      })),
      scratchpad: "The changed constraint decides the move.",
    },
    presentedAt: new Date(0).toISOString(),
    result: graded
      ? {
          met,
          criterionResults: criterionIds.map((dimensionId) => ({
            dimensionId,
            met: !missed.includes(dimensionId),
            evidence: "quote",
            missing: missed.includes(dimensionId) ? "the change" : null,
          })),
          feedback: "Feedback.",
          hypothesis: met ? null : "Holds the old rule.",
          causeType: met ? null : cause,
          errorCodes: met ? [] : ["old-rule"],
        }
      : null,
  };
};

const lesson = (): UnitStep => ({
  kind: "teach",
  lesson: "The lesson.",
  explanation: "My explanation.",
});

const round = (spec: UnitRoundSpec, parts: UnitPart[]): UnitStep => ({
  kind: "round",
  spec,
  narrative: "A shared situation.",
  difficultyVector: {
    formatId: "frq",
    reasoningPathSteps: 3,
    withheldGivens: 1,
    embeddedAlternatives: 2,
  },
  parts,
});

const cleanExam = () =>
  round(examSpec(), [
    part({ criterionIds: ["c1"] }),
    part({ criterionIds: ["c2"] }),
    part({ criterionIds: ["c1", "c2"] }),
  ]);

const failedExam = () =>
  round(examSpec(), [
    part({ criterionIds: ["c1"] }),
    part({ criterionIds: ["c2"], missed: ["c2"] }),
    part({ criterionIds: ["c1"] }),
  ]);

const finishedLearn = (criterionIds = UNIT_CRITERIA) =>
  round(learnSpec(criterionIds), [
    part({ criterionIds: [criterionIds[0] ?? "c1"] }),
    part({ criterionIds: [criterionIds[0] ?? "c1"], missed: [criterionIds[0] ?? "c1"] }),
    part({ criterionIds }),
  ]);

describe("nextMove", () => {
  it.each<[string, UnitStep[], ReturnType<typeof nextMove>]>([
    ["opens with a lesson", [], { kind: "teach" }],
    [
      "follows the explain-back with a learn round on every criterion",
      [lesson()],
      { kind: "open_round", spec: learnSpec() },
    ],
    [
      "continues a learn round part by part",
      [lesson(), round(learnSpec(), [part()])],
      { kind: "next_part" },
    ],
    [
      "continues after a missed learn part that was not a gap in teaching",
      [lesson(), round(learnSpec(), [part({ missed: ["c1"] })])],
      { kind: "next_part" },
    ],
    [
      "moves from a finished learn round to the exam, even with misses",
      [lesson(), finishedLearn()],
      { kind: "open_round", spec: examSpec() },
    ],
    [
      "completes as mastered on a clean exam",
      [lesson(), finishedLearn(), cleanExam()],
      { kind: "complete", outcome: "mastered" },
    ],
    [
      "sends a failed exam to a learn round on only the missed criteria",
      [lesson(), finishedLearn(), failedExam()],
      { kind: "open_round", spec: learnSpec(["c2"]) },
    ],
    [
      "re-teaches when a part shows the idea was never taught",
      [
        lesson(),
        round(learnSpec(), [part({ missed: ["c1"], cause: "never-learned-it" })]),
      ],
      { kind: "teach" },
    ],
    [
      "restarts an interrupted learn round in full after the re-teach",
      [
        lesson(),
        round(learnSpec(), [part({ missed: ["c1"], cause: "never-learned-it" })]),
        lesson(),
      ],
      { kind: "open_round", spec: learnSpec() },
    ],
    [
      "relearns only a failed exam's missed criteria after a re-teach",
      [
        lesson(),
        finishedLearn(),
        round(examSpec(), [
          part({ criterionIds: ["c1"] }),
          part({ criterionIds: ["c2"], missed: ["c2"], cause: "never-learned-it" }),
          part({ criterionIds: ["c1"] }),
        ]),
        lesson(),
      ],
      { kind: "open_round", spec: learnSpec(["c2"]) },
    ],
    [
      "stops re-teaching once the lesson limit is reached",
      [
        lesson(),
        lesson(),
        lesson(),
        round(learnSpec(), [part({ missed: ["c1"], cause: "never-learned-it" })]),
      ],
      { kind: "next_part" },
    ],
    [
      "ends unmastered after the third failed exam",
      [
        lesson(),
        finishedLearn(),
        failedExam(),
        finishedLearn(["c2"]),
        failedExam(),
        finishedLearn(["c2"]),
        failedExam(),
      ],
      { kind: "complete", outcome: "not_mastered" },
    ],
    [
      "ends unmastered at the exam limit even when the idea was never taught",
      [
        lesson(),
        finishedLearn(),
        failedExam(),
        finishedLearn(["c2"]),
        failedExam(),
        finishedLearn(["c2"]),
        round(examSpec(), [
          part({ criterionIds: ["c1"] }),
          part({ criterionIds: ["c2"], missed: ["c2"], cause: "never-learned-it" }),
          part({ criterionIds: ["c1"] }),
        ]),
      ],
      { kind: "complete", outcome: "not_mastered" },
    ],
  ])("%s", (_name, steps, expected) => {
    expect(nextMove(steps, UNIT_CRITERIA)).toEqual(expected);
  });

});
