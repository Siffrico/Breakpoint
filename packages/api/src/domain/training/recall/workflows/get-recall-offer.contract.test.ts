import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecallRepoShape, RecallTaskRecord } from "../recall-repo";
import { RecallModelError } from "../errors";
import { RecallRepo } from "../recall-repo";
import { getRecallOfferWorkflow } from "./get-recall-offer";
import { prepareReservedRecallWorkflow } from "./prepare-recall";

const generation = vi.hoisted(() => vi.fn());
vi.mock("../model", () => ({ generateRecallScenario: generation }));

const input = {
  userId: "learner",
  sessionId: "session",
  planId: "plan",
  boundaryNodeId: "boundary",
};
const task: RecallTaskRecord = {
  ...input,
  id: "task",
  knowledgeItemId: "knowledge",
  originalTeachingUnitNodeId: "unit",
  strengthAtReservation: 0,
  knowledgeSnapshot: {
    label: "Atomic commits",
    content: "Commit together.",
    teachingContext: "An interrupted write.",
    criteria: [{ id: "atomicity", description: "Atomic write." }],
  },
  state: "preparing",
  scenario: null,
  interactionId: null,
  currentQuestion: null,
  firstRetrieval: null,
  correctionHistory: [],
  pausedAt: null,
};
const reservation = {
  task,
  preparationLeaseId: "lease",
  previousChallenges: [],
};
const scenario = {
  challenge: "Recover the write.",
  verifier: { idealReasoning: "Commit atomically.", disqualifyingErrors: [] },
};
const makeRepo = () => {
  const getActiveTask = vi.fn<RecallRepoShape["getActiveTask"]>(() =>
    Effect.succeed(null),
  );
  const reserveDueTask = vi.fn<RecallRepoShape["reserveDueTask"]>(() =>
    Effect.succeed(null),
  );
  const savePreparedScenario = vi.fn<RecallRepoShape["savePreparedScenario"]>(
    () => Effect.succeed(true),
  );
  const repo = {
    getActiveTask,
    reserveDueTask,
    savePreparedScenario,
  } as unknown as RecallRepoShape;
  return { repo, getActiveTask, reserveDueTask, savePreparedScenario };
};
const offer = (repo: RecallRepoShape) =>
  Effect.runPromise(
    getRecallOfferWorkflow(input).pipe(Effect.provideService(RecallRepo, repo)),
  );

describe("recall offer reservation contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reserves before responding and generates only in the background continuation", async () => {
    const state = makeRepo();
    state.reserveDueTask.mockReturnValue(Effect.succeed(reservation));
    const result = await offer(state.repo);
    expect(result).toEqual({ offer: { status: "preparing" }, reservation });
    expect(generation).not.toHaveBeenCalled();
    generation.mockReturnValue(Effect.succeed(scenario));
    await Effect.runPromise(
      prepareReservedRecallWorkflow(reservation).pipe(
        Effect.provideService(RecallRepo, state.repo),
      ),
    );
    expect(state.reserveDueTask).toHaveBeenCalledTimes(1);
    expect(state.savePreparedScenario).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: task.id, leaseId: "lease", scenario }),
    );
    state.getActiveTask.mockReturnValue(
      Effect.succeed({
        ...task,
        state: "ready",
        scenario,
        interactionId: "interaction",
        currentQuestion: scenario.challenge,
      }),
    );
    expect(await offer(state.repo)).toMatchObject({
      offer: { status: "ready", task: { id: task.id } },
      reservation: null,
    });
    expect(state.reserveDueTask).toHaveBeenCalledTimes(1);
  });

  it("observes a competing worker's reservation instead of returning none", async () => {
    const state = makeRepo();
    state.getActiveTask
      .mockReturnValueOnce(Effect.succeed(null))
      .mockReturnValue(Effect.succeed(task));
    expect(await offer(state.repo)).toEqual({
      offer: { status: "preparing" },
      reservation: null,
    });
    expect(generation).not.toHaveBeenCalled();
  });

  it("returns none when nothing is due or a task is hidden at this boundary", async () => {
    const state = makeRepo();
    expect(await offer(state.repo)).toEqual({
      offer: { status: "none" },
      reservation: null,
    });
    expect(state.getActiveTask).toHaveBeenNthCalledWith(2, input);
    expect(generation).not.toHaveBeenCalled();
  });

  it("hands an expired lease to background preparation and propagates its failure", async () => {
    const state = makeRepo();
    state.getActiveTask.mockReturnValue(Effect.succeed(task));
    state.reserveDueTask.mockReturnValue(Effect.succeed(reservation));
    expect(await offer(state.repo)).toEqual({
      offer: { status: "preparing" },
      reservation,
    });
    generation.mockReturnValue(
      Effect.fail(
        new RecallModelError({
          message: "Provider failed",
          cause: new Error("offline"),
        }),
      ),
    );
    const result = await Effect.runPromise(
      prepareReservedRecallWorkflow(reservation).pipe(
        Effect.result,
        Effect.provideService(RecallRepo, state.repo),
      ),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "RecallModelError" },
    });
    expect(state.savePreparedScenario).not.toHaveBeenCalled();
  });
});
