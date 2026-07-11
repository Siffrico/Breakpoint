import { describe, expect, it, vi } from "vitest";

import { missionRepository } from "./mission-repository";

const createDb = ({
  phase,
  parentKind,
}: {
  phase: string;
  parentKind: string;
}) =>
  ({
    query: {
      TrainingUnitRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          phase,
          unitContentId: "unit-1",
        }),
      },
      TrainingUnitContent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "unit-1",
          nodeId: "node-1",
        }),
      },
      TrainingCurriculumNode: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "node-1",
            parentNodeId: "parent-1",
            planId: "plan-1",
          })
          .mockResolvedValueOnce({ id: "parent-1", kind: parentKind }),
      },
    },
  }) as never;

describe("missionRepository.getEligibleRun", () => {
  it("allows mastered skillset runs", async () => {
    const result = await missionRepository.getEligibleRun({
      db: createDb({ phase: "mastered", parentKind: "ability" }),
      userId: "user-1",
      unitRunId: "run-1",
    });

    expect(result?.eligible).toBe(true);
  });

  it("rejects owned runs outside the eligible progression state", async () => {
    const result = await missionRepository.getEligibleRun({
      db: createDb({ phase: "solve", parentKind: "ability" }),
      userId: "user-1",
      unitRunId: "run-1",
    });

    expect(result?.eligible).toBe(false);
  });
});
