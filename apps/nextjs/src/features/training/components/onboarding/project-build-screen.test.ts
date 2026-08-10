import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ProjectBuildPhase,
  ProjectBuildState,
} from "@acme/api/onboarding-chat";

import { ProjectBuildScreen } from "./project-build-screen";

const testGlobal = globalThis as typeof globalThis & { React?: typeof React };
const originalReact = testGlobal.React;

beforeAll(() => {
  testGlobal.React = React;
});

afterAll(() => {
  testGlobal.React = originalReact;
});

const renderScreen = (phase: ProjectBuildPhase) => {
  const state = {
    phase,
    projectName: "Test project",
    steps: [],
    modules: [],
    moduleCount: 1,
    sessionId: "session-1",
    firstUnitId: "unit-1",
  } satisfies ProjectBuildState;

  return renderToStaticMarkup(
    React.createElement(ProjectBuildScreen, {
      state,
      onStartLearning: vi.fn(),
    }),
  );
};

describe("ProjectBuildScreen", () => {
  it("hides Start while finalization is still in progress", () => {
    expect(renderScreen("building")).not.toContain(">Start<");
  });

  it("shows Start after the build is complete", () => {
    expect(renderScreen("complete")).toContain(">Start<");
  });
});
