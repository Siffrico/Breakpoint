import { describe, expect, it, vi } from "vitest";

import type { SQL } from "@acme/db";
import { Post } from "@acme/db/schema";

import { createTRPCRouter } from "../trpc";
import { postRouter } from "./post";

vi.mock("@acme/db/client", () => ({ db: {} }));

const containsValue = (
  candidate: unknown,
  expected: unknown,
  seen = new Set<unknown>(),
): boolean => {
  if (candidate === expected) return true;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    seen.has(candidate)
  )
    return false;
  seen.add(candidate);
  return Object.values(candidate).some((value) =>
    containsValue(value, expected, seen),
  );
};

describe("postRouter ownership", () => {
  it("assigns new posts to the caller and scopes deletion to that owner", async () => {
    let inserted: unknown;
    let deletePredicate: SQL | undefined;
    const db = {
      insert: () => ({
        values: (values: unknown) => {
          inserted = values;
          return {
            returning: () =>
              Promise.resolve([
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  title: "Owned",
                  content: "Post",
                  createdAt: new Date(0),
                  updatedAt: null,
                },
              ]),
          };
        },
      }),
      delete: () => ({
        where: (predicate: SQL) => {
          deletePredicate = predicate;
          return {
            returning: () =>
              Promise.resolve([{ id: "00000000-0000-4000-8000-000000000001" }]),
          };
        },
      }),
    };
    const caller = createTRPCRouter(postRouter).createCaller({
      db,
      session: { user: { id: "user-a" } },
    } as never);

    await caller.create({ title: "Owned", content: "Post" });
    await caller.delete("00000000-0000-4000-8000-000000000001");

    expect(inserted).toMatchObject({ userId: "user-a" });
    expect(deletePredicate).toBeDefined();
    expect(containsValue(deletePredicate, Post.id)).toBe(true);
    expect(containsValue(deletePredicate, Post.userId)).toBe(true);
    expect(containsValue(deletePredicate, "user-a")).toBe(true);
  });
});
