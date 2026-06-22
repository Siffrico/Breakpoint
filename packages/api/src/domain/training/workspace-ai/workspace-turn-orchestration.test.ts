import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceTurnOrchestrationDependencies } from "./workspace-turn-orchestration";
import { prepareWorkspaceTurnPrompt } from "./workspace-turn-orchestration";

const fail = (name: string): never => {
  throw new Error(`${name} should not be called`);
};

void test("duplicate submit with an in-flight turn id is rejected before preparing a model prompt", async () => {
  const deps = {
    listMessagesByTurnId: () =>
      Promise.resolve([
        {
          role: "user",
          content: "My first answer",
          sequence: 4,
          slot: "education_unit",
          unitId: "00000000-0000-0000-0000-000000000001",
          turnId: "turn-1",
          metadata: null,
        },
      ]),
    getActivePlan: () => fail("getActivePlan"),
    listMessages: () => fail("listMessages"),
    getWorkspaceSummary: () => fail("getWorkspaceSummary"),
    upsertWorkspaceSummary: () => fail("upsertWorkspaceSummary"),
    appendMessage: () => fail("appendMessage"),
    listPhaseResponsesBySession: () => fail("listPhaseResponsesBySession"),
    getPhaseResponses: () => fail("getPhaseResponses"),
    getUnitByNodeId: () => fail("getUnitByNodeId"),
    createUnitContent: () => fail("createUnitContent"),
    savePhaseResponse: () => fail("savePhaseResponse"),
    updateUnitMasteryContract: () => fail("updateUnitMasteryContract"),
    updateOpenScenarioContract: () => fail("updateOpenScenarioContract"),
    saveAttempt: () => fail("saveAttempt"),
    completeNode: () => fail("completeNode"),
    touchSession: () => fail("touchSession"),
    listMemories: () => fail("listMemories"),
  } satisfies WorkspaceTurnOrchestrationDependencies;

  await assert.rejects(
    () =>
      prepareWorkspaceTurnPrompt({
        sessionId: "00000000-0000-0000-0000-000000000010",
        userId: "user-1",
        turnId: "turn-1",
        message: "My first answer",
        action: "submit_answer",
        deps,
      }),
    /already being processed/i,
  );
});
