import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { MissionPlan, MissionProof, MissionSpec } from "@acme/validators";

import type { MissionAccess, MissionRepoShape } from "../mission-repo";
import { DbError } from "../../../../effect/errors";
import { MissionRepo } from "../mission-repo";
import { confirmMissionPlanWorkflow } from "./confirm-mission-plan";
import { evaluateMissionAttemptWorkflow } from "./evaluate-mission-attempt";
import { getMissionEligibilityWorkflow } from "./get-mission-eligibility";
import { openMissionConsultationWorkflow } from "./open-mission-consultation";

const SPEC = { title: "Ship one review" } as unknown as MissionSpec;
const PLAN = { steps: ["Do it"] } as unknown as MissionPlan;
const PROOF = { notes: "Done" } as unknown as MissionProof;

const ACCESS: MissionAccess = {
  run: { id: "run-1", sessionId: "session-1", mode: "complete" },
  unit: { id: "unit-1", title: "Diagnose", scenarioFocusAreas: ["evidence"] },
  node: { id: "node-1", summary: "Use evidence first." },
  parentNode: { kind: "outcome" },
  plan: { targetIdentity: "Incident commander" },
  mission: null,
};

const notImplemented = (name: string) => () =>
  Effect.die(new Error(`${name} should not be called.`));

const makeRepo = (overrides: Partial<MissionRepoShape>): MissionRepoShape => ({
  findUnitRunId: notImplemented("findUnitRunId"),
  loadMissionAccess: notImplemented("loadMissionAccess"),
  listEvaluations: notImplemented("listEvaluations"),
  listResumable: notImplemented("listResumable"),
  upsertTranscript: notImplemented("upsertTranscript"),
  confirmPlan: notImplemented("confirmPlan"),
  start: notImplemented("start"),
  reserveEvaluation: notImplemented("reserveEvaluation"),
  finishEvaluation: notImplemented("finishEvaluation"),
  cancelEvaluation: notImplemented("cancelEvaluation"),
  ...overrides,
});

const run = <A, E>(
  effect: Effect.Effect<A, E, MissionRepo>,
  repo: MissionRepoShape,
) =>
  Effect.runPromiseExit(effect.pipe(Effect.provideService(MissionRepo, repo)));

const failure = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  if (Exit.isSuccess(exit)) throw new Error("Expected a failure.");
  const cause = exit.cause as unknown as { reasons?: { error?: unknown }[] };
  return cause.reasons?.[0]?.error;
};

describe("mission workflows", () => {
  it("reports ineligibility as an answer rather than a failure", async () => {
    const repo = makeRepo({
      loadMissionAccess: () =>
        Effect.succeed({ ...ACCESS, run: { ...ACCESS.run, mode: "review" } }),
    });

    const exit = await run(
      getMissionEligibilityWorkflow({
        userId: "user-1",
        input: { unitRunId: "run-1" },
      }),
      repo,
    );

    expect(Exit.isSuccess(exit) && exit.value).toEqual({
      eligible: false,
      unitRunId: null,
    });
  });

  it("refuses to open a consultation on a closed mission", async () => {
    const repo = makeRepo({
      loadMissionAccess: () =>
        Effect.succeed({
          ...ACCESS,
          mission: { status: "completed" } as MissionAccess["mission"],
        }),
    });

    const exit = await run(
      openMissionConsultationWorkflow({ userId: "user-1", unitRunId: "run-1" }),
      repo,
    );

    expect(failure(exit)).toMatchObject({
      _tag: "MissionConflictError",
      reason: "already_completed",
    });
  });

  it("refuses a plan edit before a mission was chosen", async () => {
    const repo = makeRepo({ loadMissionAccess: () => Effect.succeed(ACCESS) });

    const exit = await run(
      confirmMissionPlanWorkflow({
        userId: "user-1",
        unitRunId: "run-1",
        plan: PLAN,
      }),
      repo,
    );

    expect(failure(exit)).toMatchObject({
      _tag: "MissionNotReadyError",
      operation: "edit_plan",
    });
  });

  it("inherits the chosen spec when a plan edit omits one", async () => {
    const confirmPlan = vi.fn(() => Effect.void);
    const repo = makeRepo({
      loadMissionAccess: () =>
        Effect.succeed({
          ...ACCESS,
          mission: { spec: SPEC } as MissionAccess["mission"],
        }),
      confirmPlan,
    });

    const exit = await run(
      confirmMissionPlanWorkflow({
        userId: "user-1",
        unitRunId: "run-1",
        plan: PLAN,
      }),
      repo,
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(confirmPlan).toHaveBeenCalledWith(
      expect.objectContaining({ spec: SPEC, plan: PLAN }),
    );
  });

  // No model is configured under test, so evaluateMissionProof fails — which is
  // precisely the path the reservation compensation exists for.
  const RESERVATION = {
    attemptId: "attempt-1",
    attemptNumber: 1,
    firstScore: null,
    mission: { id: "mission-1", spec: SPEC, plan: PLAN },
  };

  it("releases the reservation exactly once when grading fails", async () => {
    const cancelEvaluation = vi.fn(() => Effect.void);
    const finishEvaluation = vi.fn(() => Effect.void);
    const repo = makeRepo({
      reserveEvaluation: () => Effect.succeed(RESERVATION),
      finishEvaluation,
      cancelEvaluation,
    });

    const exit = await run(
      evaluateMissionAttemptWorkflow({
        userId: "user-1",
        unitRunId: "run-1",
        proof: PROOF,
      }),
      repo,
    );

    expect(failure(exit)).toMatchObject({ _tag: "MissionEvaluationError" });
    expect(cancelEvaluation).toHaveBeenCalledTimes(1);
    expect(cancelEvaluation).toHaveBeenCalledWith("attempt-1");
    expect(finishEvaluation).not.toHaveBeenCalled();
  });

  it("keeps a failing release from masking the original error", async () => {
    const repo = makeRepo({
      reserveEvaluation: () => Effect.succeed(RESERVATION),
      finishEvaluation: () => Effect.void,
      cancelEvaluation: () =>
        Effect.fail(
          new DbError({
            message: "cancel failed",
            operation: "cancelMissionEvaluation",
            kind: "connection",
          }),
        ),
    });

    const exit = await run(
      evaluateMissionAttemptWorkflow({
        userId: "user-1",
        unitRunId: "run-1",
        proof: PROOF,
      }),
      repo,
    );

    // The caller still sees the grading failure, not the cleanup's DbError.
    expect(failure(exit)).toMatchObject({ _tag: "MissionEvaluationError" });
  });
});
