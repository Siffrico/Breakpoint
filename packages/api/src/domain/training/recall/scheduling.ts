const DAY_MS = 24 * 60 * 60 * 1_000;
const REVIEW_INTERVAL_DAYS = [3, 7, 21, 60] as const;

export const recallDueAt = (strength: number, now: Date): Date => {
  const index = Math.min(
    Math.max(strength, 0),
    REVIEW_INTERVAL_DAYS.length - 1,
  );
  return new Date(now.getTime() + (REVIEW_INTERVAL_DAYS[index] ?? 60) * DAY_MS);
};

export type RecallScheduleChange =
  | {
      readonly kind: "retrieval_pass";
      readonly strength: number;
      readonly lastReinforcedAt: Date;
      readonly reviewDueAt: Date;
    }
  | {
      readonly kind: "retrieval_miss";
      readonly strength: number;
      readonly lastReinforcedAt: Date;
      readonly reviewDueAt: null;
    }
  | {
      readonly kind: "correction_complete";
      readonly strength: number;
      readonly lastReinforcedAt: Date;
      readonly reviewDueAt: Date;
    };

export const scheduleRetrievalResult = ({
  strength,
  passed,
  now,
}: {
  readonly strength: number;
  readonly passed: boolean;
  readonly now: Date;
}): RecallScheduleChange => {
  const nextStrength = passed ? strength + 1 : Math.max(0, strength - 1);
  return passed
    ? {
        kind: "retrieval_pass",
        strength: nextStrength,
        lastReinforcedAt: now,
        reviewDueAt: recallDueAt(nextStrength, now),
      }
    : {
        kind: "retrieval_miss",
        strength: nextStrength,
        lastReinforcedAt: now,
        reviewDueAt: null,
      };
};

export const scheduleCorrectionComplete = ({
  reducedStrength,
  now,
}: {
  readonly reducedStrength: number;
  readonly now: Date;
}): RecallScheduleChange => ({
  kind: "correction_complete",
  strength: Math.max(0, reducedStrength),
  lastReinforcedAt: now,
  reviewDueAt: recallDueAt(Math.max(0, reducedStrength), now),
});
