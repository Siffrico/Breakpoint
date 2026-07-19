import { describe, expect, it } from "vitest";

import { ProjectOverviewOutputSchema } from "./contracts";

describe("ProjectOverviewOutputSchema", () => {
  it("rejects a 51-character overview body so the artifact can be regenerated", () => {
    const result = ProjectOverviewOutputSchema.safeParse({
      title: "A useful title",
      summary: "A useful summary",
      body: "x".repeat(51),
    });

    expect(result.success).toBe(false);
  });
});
