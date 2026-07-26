import type { ModelMessage } from "ai";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PhaseAgentOutput } from "./agents/output-schema";
import type { PhaseAgentResult } from "./agents/run-phase-agent";
import type { ModelEventEvidence } from "./model-event";
import type { UnitPhaseRunner, UnitTurnInput } from "./orchestrate-unit-turn";
import type { ScenarioSpec } from "./scenario-spec";
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

const recipe = getUnitRecipe("education-unit-v2", {
  nodeId: "cluster-1",
  bands: null,
});

const specInput = (surface: string): ScenarioSpec => ({
  targetSkill: "Separate correlation from causation",
  surface,
  stateA: "The dashboard shows correlated changes.",
  stateB: "The team knows which intervention causes the outcome.",
  chasm: "Correlation alone cannot identify the causal mechanism.",
  frictionNoise: "Two plausible causes move together.",
  formatId: "transform",
  reasoningPathSteps: ["Name both hypotheses", "Find a differing prediction"],
  withheldGivens: [],
  embeddedAlternatives: [],
  canonicalAnswer: "Demand a discriminating prediction.",
  reasoningPath: "Name both hypotheses, find the differing observable.",
  rubric: "Passes when the answer cites a discriminating observable.",
});

const phaseResult = (
  assistantMessage: string,
  event: ModelEventEvidence | null = null,
  scenarioSpec: ScenarioSpec | null = null,
): PhaseAgentResult<PhaseAgentOutput> => ({
  object: { assistantMessage, event, scenarioSpec },
});

const runWithResult = (
  state: UnitState,
  result: PhaseAgentResult<PhaseAgentOutput>,
  options: {
    transcript?: readonly ModelMessage[];
    storedScenarioSpec?: UnitTurnInput["storedScenarioSpec"];
    solveTaskPending?: boolean;
  } = {},
) =>
  Effect.runPromise(
    runUnitTurn(
      {
        state,
        recipe,
        contextBlock: "## Context\nDeterministic test context",
        transcript: options.transcript ?? [],
        storedScenarioSpec: options.storedScenarioSpec,
        solveTaskPending: options.solveTaskPending,
      },
      { runPhase: () => Effect.succeed(result) },
    ),
  );

const stateAt = (
  phase: UnitState["phase"],
  pass: UnitState["pass"] = 1,
): UnitState => ({
  ...initialState("unit-1", "education-unit-v2"),
  phase,
  pass,
});

describe("runUnitTurn contract", () => {
  it("passes context, transcript, and the strict output mode", async () => {
    const transcript: ModelMessage[] = [
      { role: "assistant", content: "Earlier assistant message" },
      { role: "user", content: "Learner answer" },
    ];
    const runner = vi.fn<UnitPhaseRunner>(() =>
      Effect.succeed(phaseResult("Orient the learner with a useful opening.")),
    );

    await Effect.runPromise(
      runUnitTurn(
        {
          state: stateAt("orient"),
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
    expect(runner.mock.calls[0]?.[3]).toBe("orient");
    expect(transcript.at(-1)).toEqual({
      role: "user",
      content: "Learner answer",
    });
  });

  it("presents the first Solve task in the same structured generation", async () => {
    const state = stateAt("solve");
    const storedSpec = { ...specInput("A slow release"), pass: 1 as const };

    const turn = await runWithResult(
      state,
      phaseResult("Here is the complete solve task for this round.", {
        type: "phase_continues",
        reason: "prompted",
      }),
      { storedScenarioSpec: storedSpec, solveTaskPending: true },
    );

    expect(turn.event).toEqual({
      type: "phase_continues",
      reason: "prompted",
    });
    expect(turn.nextState).toEqual(state);
  });

  it("keeps the canonical target skill when Teach paraphrases it", async () => {
    const pass1Spec = { ...specInput("A slow release"), pass: 1 as const };
    const turn = await runWithResult(
      stateAt("teach"),
      phaseResult("Teach, then ask the why-probe.", null, {
        ...specInput("A flaky churn dashboard"),
        targetSkill: "A model-generated paraphrase",
      }),
      { storedScenarioSpec: pass1Spec },
    );

    expect(turn.scenarioSpec).toMatchObject({
      pass: 2,
      targetSkill: pass1Spec.targetSkill,
      surface: "A flaky churn dashboard",
    });
  });

  it("does not count a Solve continuation as a failed attempt", async () => {
    const solveState = {
      ...stateAt("solve"),
      solveRepairs: 1,
    };
    const solve = await runWithResult(
      solveState,
      phaseResult("Clarify the failure mode.", {
        type: "phase_continues",
        reason: "needs_more_work",
      }),
      {
        storedScenarioSpec: {
          ...specInput("An active scenario"),
          pass: 1,
        },
      },
    );
    expect(solve.nextState).toMatchObject({ phase: "solve", solveRepairs: 1 });
  });

  it("arms teaching after the threshold Connect failure", async () => {
    const result = await runWithResult(
      { ...stateAt("connect"), connectGrills: 1 },
      phaseResult("You missed the causal connection.", {
        type: "connection_graded",
        connected: false,
        reasoning: "Focused on symptoms.",
      }),
      {
        storedScenarioSpec: {
          ...specInput("An active scenario"),
          pass: 1,
        },
      },
    );

    expect(result.nextState).toMatchObject({
      phase: "connect",
      connectGrills: 2,
      connectTeachDue: true,
    });
  });

  it("derives pass/fail and rating evidence from the server threshold", async () => {
    const result = await runWithResult(
      stateAt("solve", 3),
      phaseResult("The solution still misses the constraint.", {
        type: "solution_graded",
        score: 64,
        reasoning: "Constraint omitted.",
        errorCodes: ["poor_problem_representation"],
      }),
      {
        storedScenarioSpec: {
          ...specInput("A transfer case"),
          pass: 3,
        },
      },
    );

    expect(result.event).toMatchObject({
      type: "solution_graded",
      passed: false,
      score: 64,
    });
    expect(result.ratingWrite).toEqual({
      score: 64,
      errorCodes: ["poor_problem_representation"],
    });
  });

  it("records an opening Connect scenario atomically with its prompt", async () => {
    const turn = await runWithResult(
      stateAt("connect"),
      phaseResult(
        "Here is the complete scenario for this round.",
        { type: "phase_continues", reason: "prompted" },
        specInput("A causal dashboard"),
      ),
    );

    expect(turn.event).toEqual({
      type: "phase_continues",
      reason: "prompted",
    });
    expect(turn.scenarioSpec).toMatchObject({
      surface: "A causal dashboard",
      pass: 1,
    });
  });

  it("authors a fresh recall scenario and stamps it with the durable pass", async () => {
    const state = {
      ...stateAt("solve", 2),
      recipeVersion: "recall-v2",
    };
    const turn = await runWithResult(
      state,
      phaseResult(
        "Recall checkpoint scenario.",
        { type: "phase_continues", reason: "prompted" },
        specInput("A recall case"),
      ),
    );

    expect(turn.scenarioSpec).toMatchObject({ pass: 2 });
  });

  it("rejects cross-phase output before applying a transition", async () => {
    await expect(
      runWithResult(
        stateAt("connect"),
        phaseResult("This output belongs to the wrong phase.", {
          type: "solution_graded",
          score: 90,
          reasoning: "Wrong phase.",
          errorCodes: [],
        }),
      ),
    ).rejects.toBeInstanceOf(EducationUnitContractError);
  });

  it("rejects incoherent score and error-code evidence", async () => {
    await expect(
      runWithResult(
        stateAt("solve"),
        phaseResult("This grade contains incoherent evidence.", {
          type: "solution_graded",
          score: 40,
          reasoning: "Missing error code.",
          errorCodes: [],
        }),
        {
          storedScenarioSpec: {
            ...specInput("An active scenario"),
            pass: 1,
          },
        },
      ),
    ).rejects.toBeInstanceOf(EducationUnitContractError);
  });

  it("rejects a later-round Connect with no active scenario before model work", async () => {
    const runner = vi.fn<UnitPhaseRunner>();
    await expect(
      Effect.runPromise(
        runUnitTurn(
          {
            state: stateAt("connect", 2),
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

  it("rejects an invalid learner-facing message from an injected runner", async () => {
    await expect(
      runWithResult(stateAt("orient"), phaseResult("")),
    ).rejects.toBeInstanceOf(EducationUnitContractError);
  });

  it("rejects a mastered unit before invoking the phase runner", async () => {
    const runner = vi.fn<UnitPhaseRunner>();
    await expect(
      Effect.runPromise(
        runUnitTurn(
          {
            state: stateAt("mastered", 3),
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
            state: stateAt("orient"),
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
