export interface AttemptTiming {
  readonly elapsedSeconds: number;
  readonly timeLimitSeconds: number;
  readonly overrunSeconds: number;
  readonly wasOverTime: boolean;
}

export const deriveServerAttemptTiming = ({
  presentedAt,
  submittedAt,
  timeLimitSeconds,
}: {
  presentedAt: Date | null | undefined;
  submittedAt: Date;
  timeLimitSeconds: number;
}): AttemptTiming | null => {
  if (!presentedAt || timeLimitSeconds <= 0) return null;

  const elapsedSeconds = Math.max(
    0,
    Math.floor((submittedAt.getTime() - presentedAt.getTime()) / 1_000),
  );
  const overrunSeconds = Math.max(0, elapsedSeconds - timeLimitSeconds);

  return {
    elapsedSeconds,
    timeLimitSeconds,
    overrunSeconds,
    wasOverTime: overrunSeconds > 0,
  };
};
