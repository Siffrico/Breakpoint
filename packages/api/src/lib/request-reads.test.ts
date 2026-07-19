import { afterEach, describe, expect, it, vi } from "vitest";

import { trainingCurriculumRepository } from "../repositories/training-curriculum-repository";
import { createRequestReads } from "./request-reads";

const sessionId = "00000000-0000-0000-0000-000000000001";

describe("createRequestReads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares one active-plan repository read between concurrent callers", async () => {
    const getActivePlan = vi
      .spyOn(trainingCurriculumRepository, "getActivePlan")
      .mockResolvedValue(null);
    const reads = createRequestReads(
      {} as Parameters<typeof createRequestReads>[0],
    );

    const first = reads.getActivePlan(sessionId);
    const second = reads.getActivePlan(sessionId);

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
    expect(getActivePlan).toHaveBeenCalledOnce();
  });

  it("evicts a failed read so the next caller retries", async () => {
    const getActivePlan = vi
      .spyOn(trainingCurriculumRepository, "getActivePlan")
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(null);
    const reads = createRequestReads(
      {} as Parameters<typeof createRequestReads>[0],
    );

    await expect(reads.getActivePlan(sessionId)).rejects.toThrow("transient");
    await expect(reads.getActivePlan(sessionId)).resolves.toBeNull();
    expect(getActivePlan).toHaveBeenCalledTimes(2);
  });
});
