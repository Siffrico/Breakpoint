import { describe, expect, it, vi } from "vitest";

import { getUnitWorkflow } from "./get-unit-workflow";

describe("getUnitWorkflow project boundary", () => {
  it("rejects a node outside the session plan before reading or mutating unit content", async () => {
    const getUnitByNodeId = vi.fn();
    const createUnitContentIfAbsent = vi.fn();
    const replaceUnitContent = vi.fn();
    const saveNodeBriefing = vi.fn();
    const staleWriteDependencies = {
      createUnitContentIfAbsent,
      replaceUnitContent,
      saveNodeBriefing,
    };

    const result = await getUnitWorkflow({
      nodeId: "00000000-0000-0000-0000-000000000002",
      sessionId: "00000000-0000-0000-0000-000000000010",
      deps: {
        getPlanNodesBySession: () =>
          Promise.resolve([
            {
              id: "00000000-0000-0000-0000-000000000001",
              parentNodeId: null,
              kind: "unit",
              title: "Owned unit",
              summary: "Owned summary",
              whyItMatters: "Owned rationale",
              orderIndex: 0,
              status: "ready",
            },
          ]),
        getUnitByNodeId,
        getPhaseResponses: vi.fn(),
        ...staleWriteDependencies,
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Unit node does not exist in this learning project.",
    });
    expect(getUnitByNodeId).not.toHaveBeenCalled();
    expect(createUnitContentIfAbsent).not.toHaveBeenCalled();
    expect(replaceUnitContent).not.toHaveBeenCalled();
    expect(saveNodeBriefing).not.toHaveBeenCalled();
  });
});
