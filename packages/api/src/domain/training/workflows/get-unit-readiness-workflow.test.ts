import { describe, expect, it, vi } from "vitest";

import type { UnitContent } from "../types/training.types";
import { getUnitReadinessWorkflow } from "./get-unit-readiness-workflow";

const nodeId = "node-1";
const unit = { id: "unit-1", nodeId } as UnitContent;

const makeDeps = () => ({
  awaitBuildSettled: vi.fn().mockResolvedValue(true),
  getUnitByNodeId: vi.fn().mockResolvedValue(null),
  waitForStartGrace: vi.fn().mockResolvedValue(undefined),
});

describe("getUnitReadinessWorkflow", () => {
  it("returns ready when preparation persisted the unit", async () => {
    const deps = makeDeps();
    deps.getUnitByNodeId.mockResolvedValue(unit);

    await expect(getUnitReadinessWorkflow({ nodeId, deps })).resolves.toEqual({
      kind: "ready",
    });
  });

  it("returns retryable failure after a permanently failed build", async () => {
    const deps = makeDeps();

    await expect(getUnitReadinessWorkflow({ nodeId, deps })).resolves.toEqual({
      kind: "failed",
      retryable: true,
      message: "Your learning unit could not be prepared. Please try again.",
    });
    expect(deps.awaitBuildSettled).toHaveBeenCalledTimes(2);
    expect(deps.waitForStartGrace).toHaveBeenCalledOnce();
  });

  it("keeps an active build preparing", async () => {
    const deps = makeDeps();
    deps.awaitBuildSettled.mockResolvedValue(false);

    await expect(getUnitReadinessWorkflow({ nodeId, deps })).resolves.toEqual({
      kind: "preparing",
    });
    expect(deps.waitForStartGrace).not.toHaveBeenCalled();
  });

  it("allows a scheduled build to acquire the lock during the grace window", async () => {
    const deps = makeDeps();
    deps.awaitBuildSettled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(getUnitReadinessWorkflow({ nodeId, deps })).resolves.toEqual({
      kind: "preparing",
    });
  });

  it("observes a build that finishes during the grace window", async () => {
    const deps = makeDeps();
    deps.getUnitByNodeId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(unit);

    await expect(getUnitReadinessWorkflow({ nodeId, deps })).resolves.toEqual({
      kind: "ready",
    });
  });
});
