import { describe, expect, it } from "vitest";

import type { RecallCandidateEntry } from "./recall-decay";
import {
  isEntryDue,
  overdueRatio,
  reinforcedStrength,
  selectRecallTarget,
} from "./recall-decay";

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = new Date("2026-07-04T12:00:00Z");

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

const entry = (
  overrides: Partial<RecallCandidateEntry> = {},
): RecallCandidateEntry => ({
  id: "entry-1",
  clusterNodeId: "cluster-1",
  label: "Closures",
  gloss: "Functions capture their defining scope.",
  checkedAt: daysAgo(1),
  strength: 0,
  lastReinforcedAt: null,
  evidenceNodeId: "unit-node-1",
  ...overrides,
});

describe("isEntryDue", () => {
  it("is not due before the strength-0 interval elapses", () => {
    expect(isEntryDue(entry({ checkedAt: daysAgo(2) }), NOW)).toBe(false);
  });

  it("is due once 3 days pass with no reinforcement", () => {
    expect(isEntryDue(entry({ checkedAt: daysAgo(3) }), NOW)).toBe(true);
  });

  it("anchors on lastReinforcedAt over checkedAt", () => {
    const reinforced = entry({
      checkedAt: daysAgo(30),
      strength: 1,
      lastReinforcedAt: daysAgo(2),
    });
    expect(isEntryDue(reinforced, NOW)).toBe(false);
  });

  it("widens the interval as strength grows", () => {
    const strong = entry({ strength: 2, lastReinforcedAt: daysAgo(10) });
    expect(isEntryDue(strong, NOW)).toBe(false); // 21-day interval
    expect(isEntryDue({ ...strong, strength: 1 }, NOW)).toBe(true); // 7-day
  });

  it("clamps strength beyond the ladder to the maintenance interval", () => {
    const veteran = entry({ strength: 9, lastReinforcedAt: daysAgo(59) });
    expect(isEntryDue(veteran, NOW)).toBe(false);
    expect(isEntryDue({ ...veteran, lastReinforcedAt: daysAgo(61) }, NOW)).toBe(
      true,
    );
  });
});

describe("selectRecallTarget", () => {
  it("returns null when nothing has decayed", () => {
    expect(selectRecallTarget([entry({ checkedAt: daysAgo(1) })], NOW)).toBe(
      null,
    );
  });

  it("picks the most overdue entry by ratio, not raw elapsed time", () => {
    const fresh = entry({ id: "a", checkedAt: daysAgo(9) }); // ratio 3
    const veteran = entry({
      id: "b",
      strength: 2,
      lastReinforcedAt: daysAgo(22),
      checkedAt: daysAgo(60),
    }); // ratio ~1.05
    const target = selectRecallTarget([veteran, fresh], NOW);
    expect(target?.primary.id).toBe("a");
    expect(overdueRatio(fresh, NOW)).toBeGreaterThan(
      overdueRatio(veteran, NOW),
    );
  });

  it("skips due entries with no evidence unit", () => {
    const orphan = entry({ id: "a", checkedAt: daysAgo(10), evidenceNodeId: null });
    expect(selectRecallTarget([orphan], NOW)).toBe(null);
  });

  it("composes a strong non-due sibling as companion", () => {
    const primary = entry({ id: "a", checkedAt: daysAgo(4) });
    const strong = entry({
      id: "b",
      strength: 3,
      lastReinforcedAt: daysAgo(2),
    });
    const target = selectRecallTarget([primary, strong], NOW);
    expect(target?.primary.id).toBe("a");
    expect(target?.companion?.id).toBe("b");
    expect(target?.evidenceNodeId).toBe("unit-node-1");
  });

  it("never composes a weak or due sibling", () => {
    const primary = entry({ id: "a", checkedAt: daysAgo(4) });
    const weak = entry({ id: "b", strength: 1, lastReinforcedAt: daysAgo(1) });
    const alsoDue = entry({
      id: "c",
      strength: 2,
      lastReinforcedAt: daysAgo(25),
    });
    const target = selectRecallTarget([primary, weak, alsoDue], NOW);
    expect(target?.companion).toBe(null);
  });

  it("never composes across clusters", () => {
    const primary = entry({ id: "a", checkedAt: daysAgo(4) });
    const otherCluster = entry({
      id: "b",
      clusterNodeId: "cluster-2",
      strength: 3,
      lastReinforcedAt: daysAgo(2),
    });
    expect(selectRecallTarget([primary, otherCluster], NOW)?.companion).toBe(
      null,
    );
  });
});

describe("reinforcedStrength", () => {
  it("climbs on pass and drops one rung on fail, floored at zero", () => {
    expect(reinforcedStrength(0, true)).toBe(1);
    expect(reinforcedStrength(2, false)).toBe(1);
    expect(reinforcedStrength(0, false)).toBe(0);
  });
});
