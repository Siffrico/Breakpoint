import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { runEffect } from "../../../router/run-effect";
import { makeDeps, node, unit } from "../unit-preparation/preparation.fixture";
import { translateUnitPreparationErrors } from "../unit-preparation/prepare-unit-edge";
import { prepareUnitWorkflow } from "./prepare-unit-workflow";

const input = () => ({
  nodeId: node.id,
  sessionId: "session-1",
  deps: Object.assign(makeDeps(), {
    getPhaseResponses: vi.fn(() => Promise.resolve([])),
  }),
});
const run = (args: ReturnType<typeof input>) =>
  runEffect(translateUnitPreparationErrors(prepareUnitWorkflow(args)));

describe("unit preparation recovery", () => {
  it("allows retry after a failed write without losing the error code", async () => {
    const args = input();
    vi.mocked(args.deps.createUnitContentIfAbsent)
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(unit);
    await expect(run(args)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    await expect(run(args)).resolves.toMatchObject({
      id: unit.id,
      nodeId: node.id,
    });
  });
  it.each([
    "getPlanNodesBySession",
    "getUnitByNodeId",
    "getPhaseResponses",
  ] as const)("preserves storage failure from %s", async (method) => {
    const args = input();
    vi.mocked(args.deps[method]).mockRejectedValue(
      new Error("private database detail"),
    );
    await expect(run(args)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Your learning unit could not be prepared. Please try again.",
    });
  });
  it("rejects a node from another project before reading or writing its content", async () => {
    const args = input();
    args.nodeId = "foreign-node";
    await expect(run(args)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(args.deps.getUnitByNodeId).not.toHaveBeenCalled();
    expect(args.deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
  });
  it("distinguishes missing context from unavailable storage", async () => {
    const args = input();
    vi.mocked(args.deps.getUnitKnowledgeContext).mockResolvedValue(null);
    await expect(run(args)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("reopens an assignment without reading the changing curriculum targets", async () => {
    const args = input();
    vi.mocked(args.deps.getUnitByNodeId).mockResolvedValue(unit);
    await expect(
      Effect.runPromise(prepareUnitWorkflow(args)),
    ).resolves.toMatchObject({ id: unit.id });
    expect(args.deps.getUnitKnowledgeContext).not.toHaveBeenCalled();
    expect(args.deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
  });
});
