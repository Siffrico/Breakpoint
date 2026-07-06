import { describe, expect, it } from "vitest";

import { ArtifactBuildError, classifyFailure } from "./agent-runtime";

describe("classifyFailure", () => {
  it("passes through an ArtifactBuildError's own kind", () => {
    const error = new ArtifactBuildError("nope", "schema");
    expect(classifyFailure(error, false)).toBe("schema");
  });

  it("does not infer truncation from unrelated generic errors", () => {
    expect(classifyFailure(new Error("stream ended"), true)).toBe("provider");
  });

  it("maps a type-validation error to schema", () => {
    const error = new Error("bad shape");
    error.name = "AI_TypeValidationError";
    expect(classifyFailure(error, false)).toBe("schema");
  });

  it("classifies a wrapped provider error from its preserved cause", () => {
    const cause = new Error("bad shape");
    cause.name = "AI_TypeValidationError";
    const error = new Error("Failed to generate the seed stage.", { cause });

    expect(classifyFailure(error, false)).toBe("schema");
  });

  it("maps an abort/timeout error to timeout", () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    expect(classifyFailure(error, false)).toBe("timeout");
  });

  it("falls back to provider for an unknown error", () => {
    expect(classifyFailure(new Error("???"), false)).toBe("provider");
  });
});
