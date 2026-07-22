const DAY_MS = 86_400_000;
const DAYS_TO_SHOW = 365;

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const buildUnitActivityCalendar = (
  activity: { date: string; count: number }[],
  today = new Date(),
) => {
  const counts = new Map(activity.map((day) => [day.date, day.count]));
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return Array.from({ length: DAYS_TO_SHOW }, (_, index) => {
    const date = new Date(todayUtc - (DAYS_TO_SHOW - index - 1) * DAY_MS);
    const dateKey = toDateKey(date);
    const count = counts.get(dateKey) ?? 0;

    return {
      date: dateKey,
      count,
      level: Math.min(count, 4),
    };
  });
};
