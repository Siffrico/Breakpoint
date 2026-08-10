import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UnitContent } from "../types/training.types";
import { makeUnitContext } from "../education-unit/unit-context.fixture";
import { getUnitWorkflow } from "./get-unit-workflow";

const runPrepareUnitMock = vi.fn<(input: unknown) => Promise<UnitContent>>();
const generateClusterBriefingMock = vi.fn(() =>
  Promise.resolve({
    briefingArc: "A diagnostic sequence.",
    briefingMap: [{ position: 1, role: "Isolate the causal signal." }],
  }),
);

vi.mock("../generate-cluster-briefing", () => ({
  generateClusterBriefing: () => generateClusterBriefingMock(),
}));

vi.mock("../unit-preparation/prepare-unit-edge", () => ({
  runPrepareUnit: (input: unknown) => runPrepareUnitMock(input),
}));

const { prepareUnitWorkflow } = await import("./prepare-unit-workflow");

const parentNode = {
  id: "cluster-1",
  parentNodeId: null,
  kind: "skill",
  title: "Diagnose incidents",
  summary: "Find causes from evidence.",
  whyItMatters: "Correct diagnosis prevents compounding failures.",
  orderIndex: 0,
  status: "ready",
};

const node = {
  id: "node-1",
  parentNodeId: parentNode.id,
  kind: "unit",
  title: "Diagnose the failure",
  summary: "Use evidence before choosing a fix.",
  whyItMatters: "Unfounded fixes compound incidents.",
  orderIndex: 1,
  status: "ready",
};

const unit = {
  id: "unit-content-1",
  nodeId: node.id,
  title: node.title,
  summary: node.summary,
  whyItMatters: node.whyItMatters,
  learningGoal: node.summary,
  seedPrompt: "Which probe would distinguish the leading hypotheses?",
  seedHint: "Name the signal each hypothesis predicts.",
  clusterArcFrame: "Move from symptoms to causal evidence.",
  clusterBriefing: null,
  complexityBudget: 1,
  buildContent: null,
  practicePrompts: null,
  teachbackSetup: {
    studentPersona: "A skeptical incident commander",
    openingMisconception: "The newest change must be the cause.",
    roundLadder: [
      { round: 1, objection: "Why?", objective: "Test causality." },
      { round: 2, objection: "What else?", objective: "Test alternatives." },
      { round: 3, objection: "What next?", objective: "Sequence probes." },
    ],
    passSignals: ["Distinguishes hypotheses"],
    failureModes: ["Guesses from timing"],
  },
  scenario: {
    title: "The slow deployment",
    focusAreas: ["causal isolation"],
  },
  unitContext: makeUnitContext(),
  difficultyBands: null,
} satisfies UnitContent;

describe("explicit unit preparation recovery", () => {
  beforeEach(() => {
    runPrepareUnitMock.mockReset();
    generateClusterBriefingMock.mockClear();
  });

  it("keeps reads pure and allows an explicit command to recover a failed prewarm", async () => {
    let storedUnit: UnitContent | null = null;
    runPrepareUnitMock
      .mockRejectedValueOnce(new Error("prewarm failed"))
      .mockImplementationOnce(async (input) => {
        const prepareClusterBriefing = (
          input as { prepareClusterBriefing?: () => Promise<void> }
        ).prepareClusterBriefing;
        await prepareClusterBriefing?.();
        storedUnit = unit;
        return unit;
      });
    const saveNodeBriefing = vi.fn(() => Promise.resolve(null));

    const deps: Parameters<typeof prepareUnitWorkflow>[0]["deps"] = {
      getPlanNodesBySession: () => Promise.resolve([parentNode, node]),
      getUnitByNodeId: () => Promise.resolve(storedUnit),
      getPhaseResponses: () => Promise.resolve([]),
      getTargetIdentity: () => Promise.resolve("Incident commander"),
      getUnitDifficulty: () => Promise.resolve(null),
      getUnitKnowledgeContext: () =>
        Promise.resolve({
          workflow: { name: "Diagnose an incident", steps: ["Choose a probe"] },
          framing: null,
          checked: [],
          targets: [
            {
              id: "entry-1",
              skill: "Diagnose incidents",
              kind: "concept",
              label: "Causal probe",
              content:
                "A probe that both hypotheses predict identically cannot separate them.",
            },
          ],
        }),
      createUnitContentIfAbsent: () => Promise.resolve(unit),
      replaceUnitContent: () => Promise.resolve(unit),
      saveNodeBriefing,
      withUnitBuildLock: (_nodeId, build) => build(deps),
    };

    const failedPrewarm = await prepareUnitWorkflow({
      nodeId: node.id,
      sessionId: "session-1",
      deps,
    });
    expect(failedPrewarm).toEqual({
      success: false,
      error: "prewarm failed",
    });

    const readAfterFailure = await getUnitWorkflow({
      nodeId: node.id,
      sessionId: "session-1",
      deps,
    });
    expect(readAfterFailure).toEqual({
      success: false,
      error: "UNIT_PREPARING",
    });
    expect(runPrepareUnitMock).toHaveBeenCalledTimes(1);

    const recovered = await prepareUnitWorkflow({
      nodeId: node.id,
      sessionId: "session-1",
      deps,
    });
    expect(recovered.success).toBe(true);
    expect(generateClusterBriefingMock).toHaveBeenCalledOnce();

    const readAfterRecovery = await getUnitWorkflow({
      nodeId: node.id,
      sessionId: "session-1",
      deps,
    });
    expect(readAfterRecovery.success).toBe(true);
    expect(runPrepareUnitMock).toHaveBeenCalledTimes(2);
  });
});
