import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecallRepoShape, RecallTaskRecord } from "../recall-repo";
import { RecallRepo } from "../recall-repo";
import { getRecallOfferWorkflow } from "./get-recall-offer";
import { prepareRecallWorkflow } from "./prepare-recall";

const generation = vi.hoisted(() => vi.fn());
vi.mock("../model", () => ({ generateRecallScenario: generation }));

const task: RecallTaskRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  userId: "learner",
  planId: "20000000-0000-4000-8000-000000000001",
  sessionId: "30000000-0000-4000-8000-000000000001",
  knowledgeItemId: "40000000-0000-4000-8000-000000000001",
  originalTeachingUnitNodeId: "50000000-0000-4000-8000-000000000001",
  strengthAtReservation: 0,
  knowledgeSnapshot: {
    label: "Atomic commits",
    content: "Commit evidence and progress together.",
    teachingContext: "A disconnect may happen after persistence.",
    criteria: [{ id: "atomicity", description: "Keeps the write atomic." }],
  },
  scenario: null,
  state: "preparing",
  interactionId: null,
  currentQuestion: null,
  firstRetrieval: null,
  correctionHistory: [],
  pausedAt: null,
};

const makeRepo = (
  reserved: boolean,
  saveResult = true,
  activeTask: RecallTaskRecord | null = null,
) => {
  const savePreparedScenario = vi.fn(() => Effect.succeed(saveResult));
  const repo: RecallRepoShape = {
    reserveDueTask: () =>
      Effect.succeed(
        reserved
          ? {
              task,
              preparationLeaseId: "60000000-0000-4000-8000-000000000001",
              previousChallenges: ["An earlier scenario"],
            }
          : null,
      ),
    savePreparedScenario,
    getActiveTask: () => Effect.succeed(activeTask),
    startTask: () => Effect.succeed(task),
    pauseTask: () => Effect.succeed(task),
    deferTask: () => Effect.succeed(task),
    claimAnswer: () => Effect.succeed({ status: "processing" }),
    commitAnswer: (input) => Effect.succeed(input.response),
    releaseAnswer: () => Effect.void,
  };
  return { repo, savePreparedScenario };
};

const run = (repo: RecallRepoShape) =>
  Effect.runPromise(
    prepareRecallWorkflow({
      userId: task.userId,
      sessionId: task.sessionId,
      planId: task.planId,
      now: new Date("2026-09-12T12:00:00.000Z"),
    }).pipe(Effect.provideService(RecallRepo, repo)),
  );

const getOffer = (repo: RecallRepoShape) =>
  Effect.runPromise(
    getRecallOfferWorkflow({
      userId: task.userId,
      sessionId: task.sessionId,
      planId: task.planId,
      boundaryNodeId: null,
    }).pipe(
      Effect.map((result) => result.offer),
      Effect.provideService(RecallRepo, repo),
    ),
  );

describe("prepare recall", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not call the model when no task needs preparation", async () => {
    const state = makeRepo(false);
    await expect(run(state.repo)).resolves.toEqual({ status: "not_needed" });
    expect(generation).not.toHaveBeenCalled();
  });

  it("generates after reservation and saves only through the lease", async () => {
    generation.mockReturnValue(
      Effect.succeed({
        challenge: "Resolve the interrupted write.",
        verifier: {
          idealReasoning: "Replay the atomic committed result.",
          disqualifyingErrors: [],
        },
      }),
    );
    const state = makeRepo(true);
    await expect(run(state.repo)).resolves.toMatchObject({
      status: "ready",
      taskId: task.id,
    });
    expect(state.savePreparedScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        leaseId: "60000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("reports a replaced preparation lease without exposing stale content", async () => {
    generation.mockReturnValue(
      Effect.succeed({
        challenge: "Stale scenario",
        verifier: {
          idealReasoning: "This content must not win.",
          disqualifyingErrors: [],
        },
      }),
    );
    const state = makeRepo(true, false);
    await expect(run(state.repo)).resolves.toEqual({ status: "lease_lost" });
  });
});

describe("recall availability", () => {
  it("distinguishes no recall from a recall being prepared", async () => {
    await expect(getOffer(makeRepo(false).repo)).resolves.toEqual({
      status: "none",
    });
    await expect(getOffer(makeRepo(false, true, task).repo)).resolves.toEqual({
      status: "preparing",
    });
  });

  it("returns the task only after preparation", async () => {
    const readyTask: RecallTaskRecord = {
      ...task,
      state: "ready",
      scenario: {
        challenge: "Resolve the interrupted write.",
        verifier: {
          idealReasoning: "Commit atomically.",
          disqualifyingErrors: [],
        },
      },
      interactionId: "60000000-0000-4000-8000-000000000002",
      currentQuestion: "Resolve the interrupted write.",
    };
    await expect(
      getOffer(makeRepo(false, true, readyTask).repo),
    ).resolves.toMatchObject({ status: "ready", task: { id: task.id } });
  });
});
