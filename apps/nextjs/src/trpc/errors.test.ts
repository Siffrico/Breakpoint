import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { recoverTRPCError } from "./errors";

describe("recoverTRPCError", () => {
  it("returns the fallback for an explicitly recoverable code", async () => {
    await expect(
      recoverTRPCError({
        promise: Promise.reject(new TRPCError({ code: "NOT_FOUND" })),
        codes: ["NOT_FOUND"],
        fallback: null,
      }),
    ).resolves.toBeNull();
  });

  it("does not hide infrastructure failures", async () => {
    const error = new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await expect(
      recoverTRPCError({
        promise: Promise.reject(error),
        codes: ["NOT_FOUND", "FORBIDDEN"],
        fallback: null,
      }),
    ).rejects.toBe(error);
  });
});
