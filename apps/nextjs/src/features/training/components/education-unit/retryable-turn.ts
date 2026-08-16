interface RetryableTurnRef {
  current: string | null;
}

export const beginRetryableTurn = (
  turnRef: RetryableTurnRef,
  createTurnId: () => string,
) => {
  if (turnRef.current) return turnRef.current;

  const turnId = createTurnId();
  turnRef.current = turnId;
  return turnId;
};

export const finishRetryableTurn = (
  turnRef: RetryableTurnRef,
  committed: boolean,
) => {
  if (committed) turnRef.current = null;
};
