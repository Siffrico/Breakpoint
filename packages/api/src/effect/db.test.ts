import { describe, expect, it } from "vitest";

import { classifyDbFailure } from "./db";

describe("classifyDbFailure", () => {
  it.each([
    ["40001", "serialization"],
    ["40P01", "deadlock"],
    ["08006", "connection"],
    ["57P01", "connection"],
    ["57014", "timeout"],
    ["23505", "constraint"],
    ["42601", "query"],
  ] as const)("classifies SQLSTATE %s as %s", (code, kind) => {
    expect(classifyDbFailure({ code })).toEqual({ kind, sqlState: code });
  });

  it("extracts SQLSTATE from a wrapped driver error", () => {
    expect(classifyDbFailure({ cause: { cause: { code: "40001" } } })).toEqual({
      kind: "serialization",
      sqlState: "40001",
    });
  });

  it.each([
    ["ECONNRESET", "connection"],
    ["ETIMEDOUT", "timeout"],
    ["UNRECOGNIZED", "unknown"],
  ] as const)("classifies runtime code %s as %s", (code, kind) => {
    expect(classifyDbFailure({ code })).toEqual({ kind });
  });

  it("classifies an opaque failure as unknown", () => {
    expect(classifyDbFailure(new Error("opaque"))).toEqual({
      kind: "unknown",
    });
  });
});
