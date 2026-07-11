import { describe, expect, it } from "vitest";

import { sourceStatusesForMissionTransition } from "./mission-lifecycle";

describe("mission lifecycle", () => {
  it("keeps completed missions terminal for start and skip", () => {
    expect(sourceStatusesForMissionTransition("start")).not.toContain(
      "completed",
    );
    expect(sourceStatusesForMissionTransition("skip")).not.toContain(
      "completed",
    );
  });

  it("requires an active mission before first completion", () => {
    expect(sourceStatusesForMissionTransition("complete")).not.toContain(
      "drafting",
    );
    expect(sourceStatusesForMissionTransition("complete")).toContain("active");
  });
});
