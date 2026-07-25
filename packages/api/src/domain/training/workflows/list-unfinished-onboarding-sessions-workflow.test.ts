import { describe, expect, it } from "vitest";

import { listUnfinishedOnboardingSessionsWorkflow } from "./list-unfinished-onboarding-sessions-workflow";

describe("listUnfinishedOnboardingSessionsWorkflow", () => {
  it("excludes completed sessions and marks a stale build interrupted", async () => {
    const now = new Date("2026-07-18T12:10:00Z");
    const result = await listUnfinishedOnboardingSessionsWorkflow({
      now,
      deps: {
        listSessions: () =>
          Promise.resolve([
            {
              id: "unfinished",
              status: "ready_for_generation",
              createdAt: new Date("2026-07-18T12:00:00Z"),
              updatedAt: new Date("2026-07-18T12:00:00Z"),
            },
            {
              id: "complete",
              status: "complete",
              createdAt: now,
              updatedAt: now,
            },
          ]),
        listFirstUserMessages: () =>
          Promise.resolve([
            { sessionId: "unfinished", content: "Learn distributed systems" },
          ]),
        listBuildRuns: () =>
          Promise.resolve([
            {
              sessionId: "unfinished",
              updatedAt: new Date("2026-07-18T12:00:00Z"),
              run: {
                status: "building",
                state: { projectName: "Reliable systems" },
              },
            },
          ]),
      },
    });

    expect(result).toEqual([
      {
        sessionId: "unfinished",
        title: "Reliable systems",
        status: "interrupted",
        updatedAt: new Date("2026-07-18T12:00:00Z"),
      },
    ]);
  });
});
