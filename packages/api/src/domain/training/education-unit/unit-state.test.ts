import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type {
  UnitPartDraft,
  UnitPartResult,
  UnitRoundSpec,
} from "@acme/validators";

import type { PersistedUnitRun } from "./unit-state";
import { DEFAULT_EDUCATION_EXPERIENCE } from "./experience";
import { makeUnitContext } from "./unit-context.fixture";
import {
  createUnitRun,
  evidencedTargetIds,
  isUnitUnopened,
  nextUnitMove,
  recordExplanation,
  recordLesson,
  recordPartAdded,
  recordPartResults,
  recordRoundOpened,
  takePreparedDraft,
  waitingFor,
  withPreparedDraft,
} from "./unit-state";

const CRITERION = "derive-under-pressure";
const vector = {
  formatId: "frq",
  reasoningPathSteps: 3,
  withheldGivens: 1,
  embeddedAlternatives: 2,
};

const run = (effect: Effect.Effect<PersistedUnitRun, unknown>) =>
  Effect.runSync(effect);
const failure = (effect: Effect.Effect<PersistedUnitRun, { message: string }>) =>
  Effect.runSync(Effect.flip(effect)).message;

const draft = (criterionIds = [CRITERION]): UnitPartDraft => ({
  question: "What does the changed limit force you to do?",
  criterionIds,
  verifier: {
    kind: "checks",
    checks: criterionIds.map((criterionId) => ({
      criterionId,
      check: "Derives the move from the changed limit.",
    })),
    scratchpad: "The changed limit decides the move.",
  },
});

const result = (met: boolean): UnitPartResult => ({
  met,
  criterionResults: [
    {
      dimensionId: CRITERION,
      met,
      evidence: "the limit changed",
      missing: met ? null : "A move derived from the limit.",
    },
  ],
  feedback: "Feedback.",
  hypothesis: met ? null : "Reuses the old move.",
  causeType: met ? null : "wrong-rule",
  errorCodes: met ? [] : ["old-move"],
});

const fresh = () =>
  createUnitRun({
    unitId: "unit-1",
    sessionId: "session-1",
    userId: "user-1",
    kind: "education",
    unitContext: makeUnitContext(),
    experience: DEFAULT_EDUCATION_EXPERIENCE,
  });

const explained = () =>
  run(recordExplanation(run(recordLesson(fresh(), "Lesson.")), "It says X."));

const openSpec = (target: PersistedUnitRun): UnitRoundSpec => {
  const move = nextUnitMove(target);
  if (move.kind !== "open_round") throw new Error(`expected a round, got ${move.kind}`);
  return move.spec;
};

const openRound = (target: PersistedUnitRun, parts: UnitPartDraft[]) =>
  recordRoundOpened({
    run: target,
    spec: openSpec(target),
    narrative: "A line runs at 30 degrees today.",
    difficultyVector: vector,
    parts,
    presentedAt: new Date(0),
  });

/** Plays a whole learn round, every part graded with `met`. */
const finishLearnRound = (target: PersistedUnitRun, met: boolean) => {
  let current = run(openRound(target, [draft()]));
  current = run(recordPartResults(current, [result(met)]));
  for (let index = 1; index < 3; index += 1) {
    current = run(recordPartAdded({ run: current, part: draft(), presentedAt: new Date(0) }));
    current = run(recordPartResults(current, [result(met)]));
  }
  return current;
};

describe("unit history", () => {
  it("starts unopened and waits for the start", () => {
    const unit = fresh();
    expect(isUnitUnopened(unit)).toBe(true);
    expect(waitingFor(unit.cursor)).toBe("start");
    expect(unit.mode).toBe("teach");
    expect(unit.roundNumber).toBe(1);
  });

  it("waits for the explain-back after the lesson, then for Continue", () => {
    const taught = run(recordLesson(fresh(), "Lesson."));
    expect(waitingFor(taught.cursor)).toBe("explanation");
    expect(taught.mode).toBe("teach");
    const after = run(recordExplanation(taught, "It says X."));
    expect(nextUnitMove(after).kind).toBe("open_round");
  });

  it("rotates the interaction id on every fact", () => {
    const unit = fresh();
    const taught = run(recordLesson(unit, "Lesson."));
    expect(taught.cursor.interactionId).not.toBe(unit.cursor.interactionId);
  });

  it("refuses a lesson when the policy's next move is something else", () => {
    expect(failure(recordLesson(explained(), "Again."))).toMatch(
      /next move is open_round/,
    );
  });

  it("refuses an explanation before the lesson", () => {
    expect(failure(recordExplanation(fresh(), "Early."))).toMatch(
      /not waiting for an explanation/,
    );
  });

  it("opens a learn round with exactly one part and waits for its answer", () => {
    const opened = run(openRound(explained(), [draft()]));
    expect(waitingFor(opened.cursor)).toBe("answer");
    expect(opened.mode).toBe("answer");
    expect(failure(openRound(explained(), [draft(), draft()]))).toMatch(
      /opens with 1 part/,
    );
  });

  it("refuses a round whose spec differs from the policy", () => {
    const target = explained();
    expect(
      failure(
        recordRoundOpened({
          run: target,
          spec: { ...openSpec(target), rated: true },
          narrative: "N",
          difficultyVector: vector,
          parts: [draft()],
          presentedAt: new Date(0),
        }),
      ),
    ).toMatch(/does not match the unit policy/);
  });

  it("refuses a part testing a criterion outside its round", () => {
    expect(failure(openRound(explained(), [draft(["elsewhere"])]))).toMatch(
      /outside its round/,
    );
  });

  it("requires every open part graded on exactly its own criteria", () => {
    const opened = run(openRound(explained(), [draft()]));
    expect(failure(recordPartResults(opened, []))).toMatch(/exactly once/);
    expect(
      failure(
        recordPartResults(opened, [
          { ...result(true), criterionResults: [] },
        ]),
      ),
    ).toMatch(/its own criteria/);
    expect(
      failure(recordPartResults(opened, [{ ...result(false), met: true }])),
    ).toMatch(/every one of its criteria/);
  });

  it("moves a finished learn round to a rated exam of three parts", () => {
    const learned = finishLearnRound(explained(), false);
    expect(waitingFor(learned.cursor)).toBe("continue");
    expect(learned.mode).toBe("feedback");
    const spec = openSpec(learned);
    expect(spec).toMatchObject({ label: "exam", rated: true, partCount: 3 });
    expect(failure(openRound(learned, [draft()]))).toMatch(/opens with 3 part/);
  });

  it("completes as mastered in the same fact as a clean exam grade", () => {
    const learned = finishLearnRound(explained(), true);
    const exam = run(openRound(learned, [draft(), draft(), draft()]));
    expect(exam.roundNumber).toBe(2);
    const graded = run(
      recordPartResults(exam, [result(true), result(true), result(true)]),
    );
    expect(graded.cursor.outcome).toBe("mastered");
    expect(graded.mode).toBe("complete");
    expect(evidencedTargetIds(graded)).toEqual(["target-1"]);
  });

  it("credits no target when a repeated criterion both passed and failed", () => {
    let current = finishLearnRound(explained(), true);
    for (let exam = 0; exam < 3; exam += 1) {
      current = run(openRound(current, [draft(), draft(), draft()]));
      current = run(
        recordPartResults(current, [result(true), result(false), result(false)]),
      );
      if (exam < 2) current = finishLearnRound(current, true);
    }
    expect(current.cursor.outcome).toBe("not_mastered");
    expect(evidencedTargetIds(current)).toEqual([]);
  });

  it("credits a skill only when every criterion carrying it was met", () => {
    const base = makeUnitContext();
    const skill = "Constraint-driven reasoning";
    const other = "Consequence checking";
    const criteria = ["c-1", "c-2", "c-3"];
    const [target] = base.targets;
    if (!target) throw new Error("fixture has a target");
    const unitContext = {
      ...base,
      targets: [
        { ...target, id: "target-1", skill },
        { ...target, id: "target-2", skill: other },
      ],
      judgment: {
        ...base.judgment,
        criteria: [
          { id: "c-1", criterion: "One.", skills: [skill] },
          { id: "c-2", criterion: "Two.", skills: [skill] },
          { id: "c-3", criterion: "Three.", skills: [other] },
        ],
      },
    };
    const graded = (met: Record<string, boolean>) => ({
      met: Object.values(met).every(Boolean),
      criterionResults: Object.entries(met).map(([dimensionId, isMet]) => ({
        dimensionId,
        met: isMet,
        evidence: "e",
        missing: isMet ? null : "m",
      })),
      feedback: "Feedback.",
      hypothesis: null,
      causeType: null,
      errorCodes: [],
    });
    const completed: PersistedUnitRun = {
      ...fresh(),
      unitContext,
      cursor: {
        ...fresh().cursor,
        outcome: "not_mastered",
        steps: [
          {
            kind: "round",
            spec: { ...openSpec(explained()), criterionIds: criteria },
            narrative: "N",
            difficultyVector: vector,
            parts: [
              { c1: true, c2: false, c3: true },
              { c1: true, c2: true, c3: true },
            ].map(({ c1, c2, c3 }) => ({
              ...draft(criteria),
              presentedAt: new Date(0).toISOString(),
              result: graded({ "c-1": c1, "c-2": c2, "c-3": c3 }),
            })),
          },
        ],
      },
    } as PersistedUnitRun;
    expect(evidencedTargetIds(completed)).toEqual(["target-2"]);
  });

  it("keeps a failed exam open for a relearn round", () => {
    const learned = finishLearnRound(explained(), true);
    const exam = run(openRound(learned, [draft(), draft(), draft()]));
    const graded = run(
      recordPartResults(exam, [result(true), result(false), result(true)]),
    );
    expect(graded.cursor.outcome).toBeNull();
    expect(graded.cursor.errorCodeHistory).toEqual(["old-move"]);
    expect(openSpec(graded)).toMatchObject({ label: "learn" });
  });

  it("uses a prepared draft only while nothing has happened since", () => {
    const taught = run(recordLesson(fresh(), "Lesson."));
    const explainedRun = run(recordExplanation(taught, "It says X."));
    const prepared = withPreparedDraft(explainedRun, {
      kind: "parts",
      narrative: "N",
      parts: [draft()],
    });
    expect(takePreparedDraft(prepared.cursor, "parts")).not.toBeNull();
    expect(takePreparedDraft(prepared.cursor, "lesson")).toBeNull();
    const moved = run(openRound(prepared, [draft()]));
    expect(moved.cursor.prepared).toBeNull();
    expect(
      takePreparedDraft(
        { ...moved.cursor, prepared: prepared.cursor.prepared },
        "parts",
      ),
    ).toBeNull();
  });
});
