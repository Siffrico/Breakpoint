import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { OutcomeCompilationOutput } from "../contracts";
import type { EnsureOutcomeCurriculumDependencies } from "./ensure-outcome-curriculum";
import {
  ensureOutcomeCurriculumWorkflow,
  OutcomeCompilationError,
} from "./ensure-outcome-curriculum";

interface Knowledge {
  readonly id: string;
}

const compilation = {
  skillMap: {},
  practiceContract: { responseMode: "transform" },
} as OutcomeCompilationOutput;

const makeDeps = (
  overrides: Partial<EnsureOutcomeCurriculumDependencies<Knowledge>> = {},
) => {
  const deps: EnsureOutcomeCurriculumDependencies<Knowledge> = {
    loadOutcome: () =>
      Effect.succeed({
        id: "outcome-1",
        kind: "outcome",
        planId: "plan-1",
        title: "Diagnose the fault",
        outcomeResult: "Explain the root cause.",
        skillMap: null,
        practiceContract: null,
      }),
    listKnowledge: () => Effect.succeed([]),
    loadPlan: () =>
      Effect.succeed({
        title: "Incident response",
        summary: "Find and explain production failures.",
        targetIdentity: "Staff engineer",
        profileVersionId: null,
        onboardingSessionId: "session-1",
      }),
    loadProfile: () => Effect.succeed(null),
    listPriorPerformance: () => Effect.succeed([]),
    compile: () => Effect.succeed(compilation),
    persist: () => Effect.succeed([{ id: "knowledge-1" }]),
    ...overrides,
  };
  return deps;
};

describe("ensureOutcomeCurriculumWorkflow", () => {
  it("returns a typed failure when the outcome is missing", async () => {
    const effect = ensureOutcomeCurriculumWorkflow({
      outcomeNodeId: "missing",
      deps: makeDeps({ loadOutcome: () => Effect.succeed(null) }),
    });

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "OutcomeNotFoundError",
      outcomeNodeId: "missing",
    });
  });

  it("returns complete persisted knowledge without compiling", async () => {
    const compile = vi.fn(() => Effect.succeed(compilation));
    const result = await Effect.runPromise(
      ensureOutcomeCurriculumWorkflow({
        outcomeNodeId: "outcome-1",
        deps: makeDeps({
          loadOutcome: () =>
            Effect.succeed({
              id: "outcome-1",
              kind: "outcome",
              planId: "plan-1",
              title: "Diagnose the fault",
              outcomeResult: "Explain the root cause.",
              skillMap: {},
              practiceContract: {},
            }),
          listKnowledge: () => Effect.succeed([{ id: "existing" }]),
          compile,
        }),
      }),
    );

    expect(result).toEqual([{ id: "existing" }]);
    expect(compile).not.toHaveBeenCalled();
  });

  it("returns a typed failure when required context is missing", async () => {
    const effect = ensureOutcomeCurriculumWorkflow({
      outcomeNodeId: "outcome-1",
      deps: makeDeps({ loadPlan: () => Effect.succeed(null) }),
    });

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "OutcomeContextMissingError",
      field: "plan",
    });
  });

  it("keeps compilation failures distinct", async () => {
    const effect = ensureOutcomeCurriculumWorkflow({
      outcomeNodeId: "outcome-1",
      deps: makeDeps({
        compile: () =>
          Effect.fail(
            new OutcomeCompilationError({
              kind: "schema",
              message: "Compilation failed.",
            }),
          ),
      }),
    });

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "OutcomeCompilationError",
      kind: "schema",
    });
  });

  it("rejects an empty persistence result", async () => {
    const effect = ensureOutcomeCurriculumWorkflow({
      outcomeNodeId: "outcome-1",
      deps: makeDeps({ persist: () => Effect.succeed([]) }),
    });

    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      _tag: "OutcomePersistenceError",
      operation: "persistOutcomeCurriculum",
    });
  });
});
