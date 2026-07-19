import { describe, expect, it, vi } from "vitest";

import { memoryRepository } from "./memory-repository";

describe("memoryRepository.create", () => {
  it("treats an existing user/content hash as an idempotent conflict", async () => {
    const returning = vi.fn(() => Promise.resolve([]));
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));

    const result = await memoryRepository.create({
      db: { insert } as never,
      userId: "user-id",
      content: "Interest: local-first systems",
      contentHash: "content-hash",
      source: "profile_update",
    });

    expect(onConflictDoNothing).toHaveBeenCalledOnce();
    expect(result).toEqual({
      success: false,
      error: {
        code: "CONFLICT",
        message: "That memory already exists.",
      },
    });
  });
});
