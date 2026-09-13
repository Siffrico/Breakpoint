import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createTRPCRouter } from "../trpc";
import { recallRouter } from "./recall";

const mocks = vi.hoisted(() => ({ offer: vi.fn(), prepare: vi.fn() }));
vi.mock("@acme/db/client", () => ({ db: {} }));
vi.mock("../repositories/training-curriculum-repository", () => ({
  trainingCurriculumRepository: {
    getOwnedActivePlan: () => Promise.resolve({ id: "plan" }),
  },
}));
vi.mock("../domain/training/recall/workflows/get-recall-offer", () => ({
  getRecallOfferWorkflow: mocks.offer,
}));
vi.mock("../domain/training/recall/workflows/prepare-recall", () => ({
  prepareReservedRecallWorkflow: mocks.prepare,
}));
vi.mock("./run-effect", () => ({
  runRecall: (_db: unknown, workflow: Effect.Effect<unknown>) =>
    Effect.runPromise(workflow),
}));

it("returns only the public offer and logs a failed background continuation", async () => {
  const reservation = { preparationLeaseId: "private-lease" };
  mocks.offer.mockReturnValue(
    Effect.succeed({ offer: { status: "preparing" }, reservation }),
  );
  mocks.prepare.mockReturnValue(Effect.fail(new Error("Provider unavailable")));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const background: (() => Promise<void>)[] = [];
  const caller = createTRPCRouter(recallRouter).createCaller({
    db: {},
    session: { user: { id: "learner" } },
    scheduleBackgroundTask: (task: () => Promise<void>) =>
      background.push(task),
  } as never);
  const sessionId = "00000000-0000-4000-8000-000000000001";
  try {
    expect(await caller.offer({ sessionId, boundaryNodeId: null })).toEqual({
      status: "preparing",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(background).toHaveLength(1);
    const prepare = background[0];
    if (!prepare) throw new Error("Missing background preparation");
    await prepare();
    expect(mocks.prepare).toHaveBeenCalledWith(reservation);
    expect(log).toHaveBeenCalledWith(
      "Recall preparation failed",
      expect.objectContaining({
        sessionId,
        planId: "plan",
        error: expect.any(Error) as unknown,
      }),
    );
  } finally {
    log.mockRestore();
  }
});

describe("offers without a reservation", () => {
  it.each(["none", "preparing", "ready"])(
    "does not schedule generation for %s",
    async (status) => {
      mocks.offer.mockReturnValue(
        Effect.succeed({ offer: { status }, reservation: null }),
      );
      const scheduleBackgroundTask = vi.fn();
      const caller = createTRPCRouter(recallRouter).createCaller({
        db: {},
        session: { user: { id: "learner" } },
        scheduleBackgroundTask,
      } as never);
      await caller.offer({
        sessionId: "00000000-0000-4000-8000-000000000001",
        boundaryNodeId: null,
      });
      expect(scheduleBackgroundTask).not.toHaveBeenCalled();
    },
  );
});
