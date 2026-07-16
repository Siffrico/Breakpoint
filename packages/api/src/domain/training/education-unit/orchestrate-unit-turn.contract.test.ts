import type { ModelMessage } from "ai";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PhaseAgentOutput } from "./agents/output-schema";
import type { PhaseAgentResult } from "./agents/run-phase-agent";
import type { UnitPhaseRunner, UnitTurnInput } from "./orchestrate-unit-turn";
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

const specInput = (surface: string) => ({
  targetSkill: "Separate correlation from causation",
  surface,
  canonicalAnswer: "Demand a discriminating prediction.",
  reasoningPath: "Name both hypotheses, find the differing observable.",
  rubric: "Passes when the answer cites a discriminating observable.",
});

const runWithResult = (
  state: UnitState,
  result: PhaseAgentResult<PhaseAgentOutput>,
  transcript: readonly ModelMessage[] = [],
  storedScenarioSpec: UnitTurnInput["storedScenarioSpec"] = null,
) =>
  Effect.runPromise(
    runUnitTurn(
      {
        state,
        recipe,
        contextBlock: "## Context\nDeterministic test context",
        transcript,
        storedScenarioSpec,
      },
      { runPhase: () => Effect.succeed(result) },
    ),
  );

describe("runUnitTurn contract", () => {
  it("executes the complete two-pass workflow without a live model", async () => {
    const script = [
      phaseResult("Orient the learner."),
      phaseResult("Here is the connection scenario.", [
        { toolName: "recordScenarioSpec", input: specInput("A slow release") },
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
          input: { score: 86, reasoning: "Correct mechanism." },
        },
      ]),
      phaseResult("Teach the concept, then ask the transfer why-probe.", [
        {
          toolName: "recordScenarioSpec",
          input: specInput("A flaky churn dashboard"),
        },
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
          input: { score: 93, reasoning: "Clear transfer." },
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
      ["solve", 2],
      ["solve", 2],
      ["mastered", 2],
    ] as const;

    // Mirrors persistence: a recorded spec overwrites, null coalesces onto
    // the stored one.
    let storedSpec: UnitTurnInput["storedScenarioSpec"] = null;
    let state = initialState("unit-1", "education-unit-v1");
    for (const [index, result] of script.entries()) {
      const turn = await runWithResult(state, result, [], storedSpec);
      const [phase, pass] = expectedStates[index] ?? [];
      expect(turn.nextState).toMatchObject({ phase, pass });
      if (turn.scenarioSpec) {
        // Teach's why-probe is the pass-2 scenario even though Teach itself
        // is still represented by the pass-1 seam state.
        expect(turn.scenarioSpec.pass).toBe(
          state.phase === "teach" ? 2 : state.pass,
        );
        storedSpec = turn.scenarioSpec;
      }
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

  it("passes context separately and preserves the transcript prefix", async () => {
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
    expect(runner.mock.calls[0]?.[1]).toEqual(transcript);
    expect(runner.mock.calls[0]?.[2]).toBe("## Context\nFirst");
    expect(transcript.at(-1)).toEqual({
      role: "user",
      content: "Learner answer",
    });
  });

  it("keeps the canonical target skill when Teach paraphrases it", async () => {
    const pass1Spec = { ...specInput("A slow release"), pass: 1 as const };
    const turn = await runWithResult(
      {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "teach",
      },
      phaseResult("Teach, then ask the why-probe.", [
        {
          toolName: "recordScenarioSpec",
          input: {
            ...specInput("A flaky churn dashboard"),
            targetSkill: "A model-generated paraphrase",
          },
        },
      ]),
      [],
      pass1Spec,
    );

    expect(turn.scenarioSpec).toMatchObject({
      pass: 2,
      targetSkill: pass1Spec.targetSkill,
      surface: "A flaky churn dashboard",
    });
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

  it("rejects a Connect scenario posed without a recorded ScenarioSpec", async () => {
    await expect(
      runWithResult(
        { ...initialState("unit-1", "education-unit-v1"), phase: "connect" },
        phaseResult("Here is the scenario.", [
          { toolName: "continuePhase", input: { reason: "prompted" } },
        ]),
      ),
    ).rejects.toBeInstanceOf(EducationUnitContractError);
  });

  it("rejects a pass-2 Solve presented without a pass-2 grading spec", async () => {
    const state: UnitState = {
      ...initialState("unit-1", "education-unit-v1"),
      phase: "solve",
      pass: 2,
    };
    const posing = phaseResult("Solve the transfer case.", [
      { toolName: "continuePhase", input: { reason: "prompted" } },
    ]);

    // No spec stored at all.
    await expect(runWithResult(state, posing)).rejects.toBeInstanceOf(
      EducationUnitContractError,
    );

    // Only pass 1's spec stored — the wrong answer key, so still rejected.
    await expect(
      runWithResult(state, posing, [], {
        ...specInput("A slow release"),
        pass: 1,
      }),
    ).rejects.toBeInstanceOf(EducationUnitContractError);

    // A stored pass-2 spec (the normal flow) is accepted.
    const normal = await runWithResult(state, posing, [], {
      ...specInput("A flaky churn dashboard"),
      pass: 2,
    });
    expect(normal.nextState).toMatchObject({ phase: "solve", pass: 2 });

    // A spec recorded on the posing turn itself (the recall opening) is
    // accepted and comes back stamped with pass 2.
    const recall = await runWithResult(
      { ...state, recipeVersion: "recall-v1" },
      phaseResult("Recall checkpoint scenario.", [
        { toolName: "recordScenarioSpec", input: specInput("A recall case") },
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
    );
    expect(recall.scenarioSpec).toMatchObject({ pass: 2 });
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
          input: { score: 90, reasoning: "Wrong phase." },
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
          input: { score: 50, reasoning: "Also graded.", errorCodes: ["weak_definition"] },
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
    {
      name: "Teach without a pass-2 scenario spec",
      state: {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "teach",
      },
      result: phaseResult("Teach without a why-probe contract."),
    },
    {
      name: "pass-2 Connect replaces the active Teach probe",
      state: {
        ...initialState("unit-1", "education-unit-v1"),
        phase: "connect",
        pass: 2,
      },
      result: phaseResult("A replacement scenario.", [
        {
          toolName: "recordScenarioSpec",
          input: specInput("A replacement surface"),
        },
        { toolName: "continuePhase", input: { reason: "prompted" } },
      ]),
    },
  ];

  it.each(invalidCases)(
    "rejects $name as a typed contract failure",
    async ({ state, result, name }) => {
      const storedSpec =
        name === "pass-2 Connect replaces the active Teach probe"
          ? { ...specInput("The Teach probe"), pass: 2 as const }
          : null;
      await expect(
        runWithResult(state, result, [], storedSpec),
      ).rejects.toBeInstanceOf(EducationUnitContractError);
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
