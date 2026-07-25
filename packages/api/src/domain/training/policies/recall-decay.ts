// policies/recall-decay.ts
//
// The recall scheduling algorithm. Pure — no DB, no clock reads; callers pass
// `now` and the candidate entries.
//
// Model: a knowledge item is "alive" while it keeps getting used. Check-off at
// unit mastery starts the clock (strength 0, anchored on checkedAt). Each
// scored recall that composes the entry either reinforces it (strength + 1,
// which widens the spacing interval) or weakens it (strength − 1, which
// tightens it). An entry whose interval has elapsed is decayed and joins the
// recall pot; the most overdue one becomes the primary target of the next
// recall interlude.
//
// Composition: recall never re-tests a skill in isolation when a well-known
// companion exists — decay in a networked domain is edges dying, not nodes —
// so a strong, non-due sibling entry from the same cluster is composed into
// the same scenario. New learning stays single-skill; recall interleaves.
//
// Companion choice is chain-first. A skill's entries are authored in
// dependency order, so the entry *next to* the primary in that order is a
// stage the practitioner passes through on the way in or out of the decayed
// one — composing it yields one continuous whole task instead of two facts
// stapled together. Preference ladder: nearest neighbour first, upstream
// beating downstream at equal distance; ties go to the most recently
// reinforced.

export interface RecallCandidate {
  id: string;
  questionId: string;
  skillNodeId: string;
  questionOrderIndex: number;
  orderIndex: number;
  label: string;
  content: string;
  /** When the entry was first checked off by a mastered unit. */
  checkedAt: Date;
  /** Consecutive scored reinforcements survived. */
  strength: number;
  lastReinforcedAt: Date | null;
  /** The unit node whose content taught this entry; recall reuses it. */
  evidenceNodeId: string | null;
}

export interface RecallTarget {
  skillNodeId: string;
  /** Unit node whose content the recall run reuses (primary's evidence). */
  evidenceNodeId: string;
  primary: RecallCandidate;
  /** A strong sibling skill composed into the same scenario, when one exists. */
  companion: RecallCandidate | null;
}

/**
 * Expanding spacing by strength: an entry must survive a recall at 3 days,
 * then 7, then 21, then it settles at 60-day maintenance checks.
 */
const REINFORCEMENT_INTERVALS_DAYS = [3, 7, 21, 60] as const;

/** Companions must be this strong to ride along without needing review. */
export const RECALL_COMPANION_MIN_STRENGTH = 2;

const DAY_MS = 24 * 60 * 60 * 1_000;

export const recallIntervalDaysFor = (strength: number): number => {
  const index = Math.min(
    Math.max(strength, 0),
    REINFORCEMENT_INTERVALS_DAYS.length - 1,
  );
  return REINFORCEMENT_INTERVALS_DAYS[index] ?? 60;
};

const intervalMsFor = (strength: number): number =>
  recallIntervalDaysFor(strength) * DAY_MS;

const anchorOf = (entry: RecallCandidate): Date =>
  entry.lastReinforcedAt ?? entry.checkedAt;

/**
 * How far past its interval an entry is, as a ratio (1 = exactly due). Ratios
 * are comparable across strengths, so a 9-day-old strength-0 entry (ratio 3)
 * outranks a 22-day-old strength-2 entry (ratio ~1.05).
 */
export const overdueRatio = (entry: RecallCandidate, now: Date): number => {
  const elapsed = now.getTime() - anchorOf(entry).getTime();
  return elapsed / intervalMsFor(entry.strength);
};

export const isEntryDue = (entry: RecallCandidate, now: Date): boolean =>
  overdueRatio(entry, now) >= 1;

/**
 * How the companion's stage relates to the primary's in the scenario: "setup"
 * opens the scenario a stage earlier and hands off to the target,
 * "continuation" carries it a stage past the target, "peer" sits at the same
 * position (only reachable for entries authored at the same order).
 */
export type CompanionRelation = "setup" | "continuation" | "peer";

export const companionRelation = (
  primary: Pick<RecallCandidate, "questionId" | "questionOrderIndex">,
  companion: Pick<RecallCandidate, "questionId" | "questionOrderIndex">,
): CompanionRelation => {
  if (companion.questionId === primary.questionId) return "peer";
  return companion.questionOrderIndex < primary.questionOrderIndex
    ? "setup"
    : "continuation";
};

/**
 * Sort key for the companion preference ladder; lower tuples win. Mirrors the
 * ORDER BY in skill-knowledge-repository.ts — keep them equivalent.
 */
const companionRank = (
  primary: RecallCandidate,
  entry: RecallCandidate,
): [sameQuestion: number, gap: number, itemGap: number, downstream: number] => {
  const delta = entry.questionOrderIndex - primary.questionOrderIndex;
  const itemDelta = entry.orderIndex - primary.orderIndex;
  return [
    entry.questionId === primary.questionId ? 0 : 1,
    Math.abs(delta),
    Math.abs(itemDelta),
    (entry.questionId === primary.questionId ? itemDelta : delta) > 0 ? 1 : 0,
  ];
};

/**
 * Takes every checked knowledge item in the plan and the current time;
 * produces the next recall target, or null when nothing has decayed. Entries
 * without an evidence unit cannot be run and are skipped.
 */
export const selectRecallTarget = (
  entries: readonly RecallCandidate[],
  now: Date,
): RecallTarget | null => {
  const due = entries
    .filter((entry) => entry.evidenceNodeId !== null && isEntryDue(entry, now))
    .sort((left, right) => overdueRatio(right, now) - overdueRatio(left, now));

  const primary = due[0];
  if (!primary?.evidenceNodeId) return null;

  const companion =
    entries
      .filter(
        (entry) =>
          entry.skillNodeId === primary.skillNodeId &&
          entry.id !== primary.id &&
          entry.strength >= RECALL_COMPANION_MIN_STRENGTH &&
          !isEntryDue(entry, now),
      )
      .sort((left, right) => {
        const [leftSame, leftGap, leftItemGap, leftDownstream] = companionRank(
          primary,
          left,
        );
        const [rightSame, rightGap, rightItemGap, rightDownstream] =
          companionRank(primary, right);
        return (
          leftSame - rightSame ||
          leftGap - rightGap ||
          leftItemGap - rightItemGap ||
          leftDownstream - rightDownstream ||
          anchorOf(right).getTime() - anchorOf(left).getTime()
        );
      })[0] ?? null;

  return {
    skillNodeId: primary.skillNodeId,
    evidenceNodeId: primary.evidenceNodeId,
    primary,
    companion,
  };
};

/**
 * The strength update a scored recall verdict applies to each composed entry.
 * Pass extends the ladder; fail drops one rung (never below zero) so the
 * entry comes back sooner without restarting from scratch.
 */
export const reinforcedStrength = (
  strength: number,
  passed: boolean,
): number => (passed ? strength + 1 : Math.max(0, strength - 1));
