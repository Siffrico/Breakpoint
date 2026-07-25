import { describe, expect, it } from "vitest";

import type {
  OnboardingChatUIMessage,
  ProjectBuildPhase,
  ProjectBuildState,
} from "@acme/api/onboarding-chat";

import { selectProjectBuildPart } from "./select-project-build-part";

const buildState = (
  phase: ProjectBuildPhase,
  moduleCount: number,
): ProjectBuildState => ({
  phase,
  projectName: "Test project",
  steps: [],
  modules: [],
  moduleCount,
  sessionId: "session-1",
});

const buildMessage = (
  id: string,
  state: ProjectBuildState,
): OnboardingChatUIMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "data-project-build", data: state }],
});

describe("selectProjectBuildPart", () => {
  it("keeps a persisted completion authoritative over later stale progress", () => {
    const complete = buildState("complete", 4);
    const staleBuilding = buildState("building", 0);

    const selected = selectProjectBuildPart([
      buildMessage("persisted", complete),
      buildMessage("stale-live", staleBuilding),
    ]);

    expect(selected).toMatchObject({ messageId: "persisted", state: complete });
  });

  it("keeps completion authoritative when message reconciliation reverses the order", () => {
    const staleBuilding = buildState("building", 0);
    const complete = buildState("complete", 4);

    const selected = selectProjectBuildPart([
      buildMessage("stale-live", staleBuilding),
      buildMessage("persisted", complete),
    ]);

    expect(selected).toMatchObject({ messageId: "persisted", state: complete });
  });

  it("uses the latest snapshot while no completion exists", () => {
    const initial = buildState("building", 0);
    const progressed = buildState("building", 2);

    const selected = selectProjectBuildPart([
      buildMessage("initial", initial),
      buildMessage("progressed", progressed),
    ]);

    expect(selected).toMatchObject({
      messageId: "progressed",
      state: progressed,
    });
  });
});
