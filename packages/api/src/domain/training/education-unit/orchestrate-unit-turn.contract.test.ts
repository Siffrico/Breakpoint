import type { ModelMessage } from "ai";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PhaseAgentOutput } from "./agents/output-schema";
import type { PhaseAgentResult } from "./agents/run-phase-agent";
import type { UnitPhaseRunner } from "./orchestrate-unit-turn";
import type { UnitState } from "./unit";
import {
  AgentProviderRejectedError,
  AgentSchemaError,
  AgentTimeoutError,
} from "./agents/errors";
import { initialState } from "./fsm";
import {
  EducationUnitContractError,
  runUnitTurn,
} from "./orchestrate-unit-turn";
import { getUnitRecipe } from "./unit";

const recipe = getUnitRecipe("education-unit-v1", {
  nodeId: "cluster-1",
  bands: null,
});

const phaseResult = (
  assistantMessage: string,
  toolCalls: PhaseAgentResult<PhaseAgentOutput>["toolCalls"] = [],
): PhaseAgentResult<PhaseAgentOutput> => ({
  object: { assistantMessage },
  toolCalls,
});

const runWithResult = (
  state: UnitState,
  result: PhaseAgentResult<PhaseAgentOutput>,
  transcript: readonly ModelMessage[] = [],
) =>
  Effect.runPromise(
    runUnitTurn(
      {
        state,
        recipe,
        contextBlock: "## Context\nDeterministic test context",
        transcript,
      },
      { runPhase: () => Effect.succeed(result) },
    ),
  );

describe("runUnitTurn contract", () => {
  it("executes the complete two-pass workflow without a live model", async () => {
    const script = [
      phaseResult("Orient the learner."),
      phaseResult("Here is the connection scenario.", [
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
      phaseResult("You reconstructed the connection.", [
        {
          toolName: "gradeConnection",
          input: { connected: true, reasoning: "Named the causal link." },
        },
      ]),
      phaseResult("Now propose a solution.", [
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
      phaseResult("The first solution works.", [
        {
          toolName: "gradeSolution",
          input: { passed: true, score: 86, reasoning: "Correct mechanism." },
        },
      ]),
      phaseResult("Teach the underlying concept."),
      phaseResult("Here is a transfer scenario.", [
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
      phaseResult("The transfer connection is correct.", [
        {
          toolName: "gradeConnection",
          input: { connected: true, reasoning: "Transferred the mechanism." },
        },
      ]),
      phaseResult("Solve the transfer case.", [
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
      phaseResult("Mastered.", [
        {
          toolName: "gradeSolution",
          input: { passed: true, score: 93, reasoning: "Clear transfer." },
        },
        {
          toolName: "checkOffSyllabus",
          input: {
            entryIds: ["entry-1"],
            evidence: "The learner separated correlation from causality.",
          },
        },
      ]),
    ];

    const expectedStates = [
      ["connect", 1],
      ["connect", 1],
      ["solve", 1],
      ["solve", 1],
      ["teach", 1],
      ["connect", 2],
      ["connect", 2],
      ["solve", 2],
      ["solve", 2],
      ["mastered", 2],
    ] as const;

    let state = initialState("unit-1", "education-unit-v1");
    for (const [index, result] of script.entries()) {
      const turn = await runWithResult(state, result);
      const [phase, pass] = expectedStates[index] ?? [];
      expect(turn.nextState).toMatchObject({ phase, pass });
      expect(turn.assistantMessage).toBe(result.object.assistantMessage);
      expect(turn.ratingWrite).toEqual(
        index === script.length - 1 ? { score: 93, errorCodes: [] } : null,
      );
      expect(turn.syllabusCheckOff).toEqual(
        index === script.length - 1
          ? {
              entryIds: ["entry-1"],
              evidence: "The learner separated correlation from causality.",
            }
          : null,
      );
      state = turn.nextState;
    }

    expect(state).toMatchObject({ phase: "mastered", pass: 2 });
  });

  it("prepends context and preserves transcript order", async () => {
    const transcript: ModelMessage[] = [
      { role: "assistant", content: "Earlier assistant message" },
      { role: "user", content: "Learner answer" },
    ];
    const runner = vi.fn<UnitPhaseRunner>(() =>
      Effect.succeed(phaseResult("Orient the learner.")),
    );

    await Effect.runPromise(
      runUnitTurn(
        {
          state: initialState("unit-1", "education-unit-v1"),
          recipe,
          contextBlock: "## Context\nFirst",
          transcript,
        },
        { runPhase: runner },
      ),
    );

    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0]?.[1]).toEqual([
      { role: "user", content: "## Context\nFirst" },
      ...transcript,
    ]);
  });

  it("does not count a continuation as a failed attempt", async () => {
    const connect = await runWithResult(
      {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "connect",
        connectGrills: 1,
      },
      phaseResult("Think about the causal link again.", [
        {
          toolName: "continuePhase",
          input: { reason: "needs_more_work" },
        },
      ]),
    );
    expect(connect.event).toEqual({
      type: "phase_continues",
      reason: "needs_more_work",
    });
    expect(connect.nextState).toMatchObject({
      phase: "connect",
      connectGrills: 1,
    });

    const solve = await runWithResult(
      {
        ...connect.nextState,
        phase: "solve",
        solveRepairs: 1,
      },
      phaseResult("Clarify the failure mode.", [
        {
          toolName: "continuePhase",
          input: { reason: "needs_more_work" },
        },
      ]),
    );
    expect(solve.nextState).toMatchObject({ phase: "solve", solveRepairs: 1 });
  });

  it("marks only the threshold Connect failure as a forced advance", async () => {
    const result = await runWithResult(
      {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "connect",
        connectGrills: 1,
      },
      phaseResult("You missed the causal connection.", [
        {
          toolName: "gradeConnection",
          input: { connected: false, reasoning: "Focused on symptoms." },
        },
      ]),
    );

    expect(result.forcedConnectAdvance).toBe(true);
    expect(result.nextState).toMatchObject({
      phase: "solve",
      connectGrills: 0,
    });
  });

  it("exposes the first pass-2 Solve failure as rating evidence", async () => {
    const result = await runWithResult(
      {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "solve",
        pass: 2,
      },
      phaseResult("The solution still misses the constraint.", [
        {
          toolName: "gradeSolution",
          input: {
            passed: false,
            score: 64,
            reasoning: "Constraint omitted.",
            errorCodes: ["poor_problem_representation"],
          },
        },
      ]),
    );

    expect(result.nextState).toMatchObject({ phase: "solve", solveRepairs: 1 });
    expect(result.ratingWrite).toEqual({
      score: 64,
      errorCodes: ["poor_problem_representation"],
    });
  });

  const invalidCases: {
    name: string;
    state: UnitState;
    result: PhaseAgentResult<PhaseAgentOutput>;
  }[] = [
    {
      name: "missing event",
      state: {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "connect",
      },
      result: phaseResult("No explicit event."),
    },
    {
      name: "wrong-phase event",
      state: {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "connect",
      },
      result: phaseResult("Wrong tool.", [
        {
          toolName: "gradeSolution",
          input: { passed: true, score: 90, reasoning: "Wrong phase." },
        },
      ]),
    },
    {
      name: "duplicate events",
      state: { ...initialState("unit-1", "education-unit-v1"), phase: "solve" },
      result: phaseResult("Conflicting tools.", [
        { toolName: "continuePhase", input: { reason: "needs_more_work" } },
        {
          toolName: "gradeSolution",
          input: { passed: false, score: 50, reasoning: "Also graded." },
        },
      ]),
    },
    {
      name: "invalid arguments",
      state: {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "connect",
      },
      result: phaseResult("Invalid args.", [
        { toolName: "continuePhase", input: { reason: "maybe" } },
      ]),
    },
    {
      name: "unexpected Orient tool",
      state: initialState("unit-1", "education-unit-v1"),
      result: phaseResult("Orient with a tool.", [
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
    },
  ];

  it.each(invalidCases)(
    "rejects $name as a typed contract failure",
    async ({ state, result }) => {
      await expect(runWithResult(state, result)).rejects.toBeInstanceOf(
        EducationUnitContractError,
      );
    },
  );

  it("rejects an invalid learner-facing message from an injected runner", async () => {
    const invalid = {
      object: { assistantMessage: "" },
      toolCalls: [],
    } as PhaseAgentResult<PhaseAgentOutput>;

    await expect(
      runWithResult(initialState("unit-1", "education-unit-v1"), invalid),
    ).rejects.toBeInstanceOf(EducationUnitContractError);
  });

  it("rejects a mastered unit before invoking the phase runner", async () => {
    const runner = vi.fn<UnitPhaseRunner>();
    await expect(
      Effect.runPromise(
        runUnitTurn(
          {
            state: {
              ...initialState("unit-1", "education-unit-v1"),
              phase: "mastered",
              pass: 2,
            },
            recipe,
            contextBlock: "context",
            transcript: [],
          },
          { runPhase: runner },
        ),
      ),
    ).rejects.toBeInstanceOf(EducationUnitContractError);
    expect(runner).not.toHaveBeenCalled();
  });

  it.each([
    new AgentProviderRejectedError({ message: "provider rejected" }),
    new AgentTimeoutError({ message: "provider timed out" }),
    new AgentSchemaError({ message: "invalid schema" }),
  ])("preserves the $._tag failure", async (failure) => {
    const runner: UnitPhaseRunner = () => Effect.fail(failure);

    await expect(
      Effect.runPromise(
        runUnitTurn(
          {
            state: initialState("unit-1", "education-unit-v1"),
            recipe,
            contextBlock: "context",
            transcript: [],
          },
          { runPhase: runner },
        ),
      ),
    ).rejects.toMatchObject({ _tag: failure._tag });
  });
});
