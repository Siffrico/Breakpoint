import { describe, expect, it, vi } from "vitest";

import { beginRetryableTurn, finishRetryableTurn } from "./retryable-turn";

describe("retryable turn identity", () => {
  it("keeps the turn id until the request is confirmed", () => {
    const turnRef = { current: null as string | null };
    const createTurnId = vi
      .fn<() => string>()
      .mockReturnValueOnce("turn-1")
      .mockReturnValueOnce("turn-2");

    expect(beginRetryableTurn(turnRef, createTurnId)).toBe("turn-1");
    finishRetryableTurn(turnRef, false);
    expect(beginRetryableTurn(turnRef, createTurnId)).toBe("turn-1");

    finishRetryableTurn(turnRef, true);
    expect(beginRetryableTurn(turnRef, createTurnId)).toBe("turn-2");
    expect(createTurnId).toHaveBeenCalledTimes(2);
  });
});
