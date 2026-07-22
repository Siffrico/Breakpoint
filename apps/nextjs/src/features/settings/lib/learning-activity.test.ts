import { describe, expect, it } from "vitest";

import { buildUnitActivityCalendar } from "./learning-activity";

describe("buildUnitActivityCalendar", () => {
  it("fills a trailing year and maps daily counts to capped intensity levels", () => {
    const calendar = buildUnitActivityCalendar(
      [
        { date: "2026-07-14", count: 2 },
        { date: "2026-07-15", count: 7 },
      ],
      new Date("2026-07-15T18:00:00.000Z"),
    );

    expect(calendar).toHaveLength(365);
    expect(calendar[0]).toMatchObject({ date: "2025-07-16", count: 0 });
    expect(calendar.at(-2)).toMatchObject({ count: 2, level: 2 });
    expect(calendar.at(-1)).toMatchObject({ count: 7, level: 4 });
  });
});
