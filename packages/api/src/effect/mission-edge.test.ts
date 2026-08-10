import { Cause } from "effect";
import { describe, expect, it } from "vitest";

import type {
  MissionConflictReason,
  MissionError,
} from "../domain/training/missions/mission-errors";
import {
  MissionConflictError,
  MissionEvaluationError,
  MissionInputError,
  MissionModelUnavailableError,
  MissionNotEligibleError,
  MissionNotFoundError,
  MissionNotReadyError,
} from "../domain/training/missions/mission-errors";
import { DbError } from "./errors";
import { resolveMissionFailure, toolFailureMessage } from "./mission-edge";

const CONFLICT_REASONS: MissionConflictReason[] = [
  "already_completed",
  "start_race",
  "evaluation_in_flight",
  "finish_race",
];

const ALL_ERRORS: MissionError[] = [
  new MissionNotFoundError({ entity: "mission unit" }),
  new MissionNotEligibleError({ unitRunId: "run-1" }),
  new MissionNotReadyError({ operation: "start" }),
  new MissionNotReadyError({ operation: "edit_plan" }),
  new MissionNotReadyError({ operation: "evaluate" }),
  ...CONFLICT_REASONS.map((reason) => new MissionConflictError({ reason })),
  new MissionInputError({ field: "messages" }),
  new MissionModelUnavailableError({ purpose: "mission" }),
  new MissionEvaluationError({ cause: new Error("model down") }),
  new DbError({
    message: "Database operation failed: startMission",
    operation: "startMission",
    kind: "connection",
  }),
];

describe("mission failure table", () => {
  it("resolves every tag and every conflict reason to distinct transport", () => {
    for (const error of ALL_ERRORS) {
      const failure = resolveMissionFailure(error);
      expect(failure.message.length).toBeGreaterThan(0);
      expect(failure.status).toBeGreaterThanOrEqual(400);
      expect(failure.code).toBeTruthy();
    }
  });

  it("gives each conflict reason its own copy", () => {
    const messages = CONFLICT_REASONS.map(
      (reason) =>
        resolveMissionFailure(new MissionConflictError({ reason })).message,
    );
    expect(new Set(messages).size).toBe(CONFLICT_REASONS.length);
  });

  it.each([
    ["MissionNotFoundError", 404, new MissionNotFoundError({ entity: "x" })],
    [
      "MissionNotEligibleError",
      403,
      new MissionNotEligibleError({ unitRunId: "r" }),
    ],
    [
      "MissionNotReadyError",
      412,
      new MissionNotReadyError({ operation: "start" }),
    ],
    [
      "MissionConflictError",
      409,
      new MissionConflictError({ reason: "evaluation_in_flight" }),
    ],
    ["MissionInputError", 400, new MissionInputError({ field: "messages" })],
  ] as const)("maps %s to %i", (_tag, status, error) => {
    expect(resolveMissionFailure(error).status).toBe(status);
  });
});

describe("toolFailureMessage", () => {
  it("surfaces the predefined copy for a typed conflict", () => {
    expect(
      toolFailureMessage(
        Cause.fail(
          new MissionConflictError({ reason: "evaluation_in_flight" }),
        ),
      ),
    ).toBe("This proof is already being evaluated.");
  });

  it("never leaks infrastructure detail to the model", () => {
    const dbError = new DbError({
      message: "Database operation failed: reserveMissionEvaluation",
      operation: "reserveMissionEvaluation",
      sqlState: "40001",
      kind: "serialization",
    });

    const message = toolFailureMessage(Cause.fail(dbError));
    expect(message).toBe("The mission guide hit an error. Try again.");
    expect(message).not.toMatch(/reserveMissionEvaluation|40001/);
  });

  it("collapses a defect to the generic line", () => {
    expect(
      toolFailureMessage(Cause.die(new Error("secret internal detail"))),
    ).toBe("The mission guide hit an error. Try again.");
  });
});
