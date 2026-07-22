import { describe, expect, it } from "vitest";

import type { ExchangeMessage } from "./exchange-grouping";
import { groupLiveExchanges, toCompletedExchanges } from "./exchange-grouping";

const assistant = (id: string, text = `prompt ${id}`): ExchangeMessage => ({
  id,
  role: "assistant",
  text,
});

const user = (
  id: string,
  text = `answer ${id}`,
  failed?: boolean,
): ExchangeMessage => ({ id, role: "user", text, failed });

describe("toCompletedExchanges", () => {
  it("pairs alternating assistant/user messages", () => {
    const exchanges = toCompletedExchanges([
      assistant("a1"),
      user("u1"),
      assistant("a2"),
      user("u2"),
    ]);

    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]?.prompt?.id).toBe("a1");
    expect(exchanges[0]?.answer?.id).toBe("u1");
    expect(exchanges[1]?.prompt?.id).toBe("a2");
    expect(exchanges[1]?.answer?.id).toBe("u2");
  });

  it("leaves a trailing assistant turn unanswered", () => {
    const exchanges = toCompletedExchanges([
      assistant("a1"),
      user("u1"),
      assistant("a2"),
    ]);

    expect(exchanges).toHaveLength(2);
    expect(exchanges[1]?.prompt?.id).toBe("a2");
    expect(exchanges[1]?.answer).toBeNull();
  });

  it("treats a leading user message as an orphan exchange", () => {
    const exchanges = toCompletedExchanges([user("u0"), assistant("a1")]);

    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]?.prompt).toBeNull();
    expect(exchanges[0]?.answer?.id).toBe("u0");
    expect(exchanges[1]?.prompt?.id).toBe("a1");
  });

  it("returns no exchanges for an empty transcript", () => {
    expect(toCompletedExchanges([])).toEqual([]);
  });
});

describe("groupLiveExchanges", () => {
  it("keeps the latest assistant turn as the active prompt", () => {
    const grouped = groupLiveExchanges([
      assistant("a1"),
      user("u1"),
      assistant("a2"),
    ]);

    expect(grouped.history).toHaveLength(1);
    expect(grouped.history[0]?.prompt?.id).toBe("a1");
    expect(grouped.activePrompt?.id).toBe("a2");
    expect(grouped.pendingAnswer).toBeNull();
  });

  it("keeps an answered-but-unreplied answer pending on the active prompt", () => {
    const grouped = groupLiveExchanges([
      assistant("a1"),
      user("u1"),
      assistant("a2"),
      user("u2"),
    ]);

    expect(grouped.history).toHaveLength(1);
    expect(grouped.activePrompt?.id).toBe("a2");
    expect(grouped.pendingAnswer?.id).toBe("u2");
  });

  it("collapses the previous exchange the moment the next reply starts streaming", () => {
    const grouped = groupLiveExchanges([
      assistant("a1"),
      user("u1"),
      assistant("a2", ""),
    ]);

    expect(grouped.history).toHaveLength(1);
    expect(grouped.history[0]?.answer?.id).toBe("u1");
    expect(grouped.activePrompt?.id).toBe("a2");
  });

  it("pins failed sends out of history regardless of position", () => {
    const grouped = groupLiveExchanges([
      assistant("a1"),
      user("u1-failed", "failed answer", true),
      user("u1"),
      assistant("a2"),
      user("u2-failed", "another failure", true),
    ]);

    expect(grouped.failedAnswers.map((message) => message.id)).toEqual([
      "u1-failed",
      "u2-failed",
    ]);
    expect(grouped.history).toHaveLength(1);
    expect(grouped.history[0]?.answer?.id).toBe("u1");
    expect(grouped.activePrompt?.id).toBe("a2");
    expect(grouped.pendingAnswer).toBeNull();
  });

  it("handles an empty transcript", () => {
    const grouped = groupLiveExchanges([]);

    expect(grouped.history).toEqual([]);
    expect(grouped.activePrompt).toBeNull();
    expect(grouped.pendingAnswer).toBeNull();
    expect(grouped.failedAnswers).toEqual([]);
  });

  it("treats an orphan user message as pending with no active prompt", () => {
    const grouped = groupLiveExchanges([user("u0")]);

    expect(grouped.activePrompt).toBeNull();
    expect(grouped.pendingAnswer?.id).toBe("u0");
    expect(grouped.history).toEqual([]);
  });
});
