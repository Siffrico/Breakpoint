import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UnitContent } from "../types/training.types";
import type {
  SeedStageOutput,
  UnitBuilderContext,
} from "../unit-builder/contracts";
import type { UnitPreparationDependencies } from "./prepare-unit-content";

const runSeedStageMock =
  vi.fn<(context: UnitBuilderContext) => Promise<SeedStageOutput>>();

vi.mock("../unit-builder/seed-stage", () => ({
  runSeedStage: (context: UnitBuilderContext) => runSeedStageMock(context),
}));

const { prepareUnitContent } = await import("./prepare-unit-content");

const node = { id: "node-1" };
const planNode = {
  id: node.id,
  parentNodeId: "cluster-1",
  kind: "unit",
  title: "Isolate the failure",
  summary: "Use evidence to narrow the cause.",
  whyItMatters: "The first symptom is rarely enough.",
  orderIndex: 1,
  status: "ready",
};
const planNodes = [
  {
    id: "cluster-1",
    parentNodeId: null,
    kind: "ability",
    title: "Diagnosis",
    summary: "Find causes before fixes.",
    whyItMatters: "Bad diagnosis compounds errors.",
    orderIndex: 0,
    status: "ready",
  },
  planNode,
];

const setup = {
  title: "Isolate the failure",
  seedPrompt: "A deployment slows after one change. What do you inspect first?",
  seedHint: "Name the probe and the signal it would distinguish.",
  clusterArcFrame: "Move from symptoms to discriminating evidence.",
  complexityBudget: 1,
  teachbackSetup: {
    studentPersona: "A skeptical incident commander",
    openingMisconception: "The newest change must be the cause.",
    roundLadder: [
      { round: 1, objection: "Why that probe?", objective: "Test causality." },
      {
        round: 2,
        objection: "What else fits?",
        objective: "Test alternatives.",
      },
      { round: 3, objection: "What next?", objective: "Test sequencing." },
    ],
    passSignals: ["Distinguishes hypotheses", "Uses evidence"],
    failureModes: ["Guesses from timing", "Changes multiple variables"],
  },
  scenario: {
    title: "The slow deployment",
    focusAreas: ["causal isolation", "diagnostic sequencing"],
  },
  conceptTarget: "discriminating evidence",
  misconceptionTarget: "temporal proximity proves causality",
  workedExampleBrief: "Compare two low-risk probes.",
  proofTargets: ["chooses a discriminating probe", "updates from evidence"],
} satisfies SeedStageOutput;

const unit = {
  id: "content-1",
  nodeId: node.id,
  title: setup.title,
  summary: planNode.summary,
  whyItMatters: planNode.whyItMatters,
  learningGoal: planNode.summary,
  seedPrompt: setup.seedPrompt,
  seedHint: setup.seedHint,
  clusterArcFrame: setup.clusterArcFrame,
  clusterBriefing: null,
  complexityBudget: setup.complexityBudget,
  buildContent: null,
  practicePrompts: null,
  teachbackSetup: setup.teachbackSetup,
  scenario: setup.scenario,
  unitMasteryContract: null,
  difficultyBands: null,
} satisfies UnitContent;

const makeDeps = (
  overrides: Partial<UnitPreparationDependencies> = {},
): UnitPreparationDependencies => {
  const deps: UnitPreparationDependencies = {
    getUnitByNodeId: vi.fn(() => Promise.resolve(null)),
    getPlanNodesBySession: vi.fn(() => Promise.resolve(planNodes)),
    getTargetIdentity: vi.fn(() => Promise.resolve("Incident commander")),
    listAttemptHistory: vi.fn(() => Promise.resolve([])),
    getUnitKnowledgeContext: vi.fn(() =>
      Promise.resolve({
        workflow: { name: "Diagnose an incident", steps: ["Choose a probe"] },
        framing: null,
        checked: [],
        targets: [
          {
            id: "entry-1",
            kind: "concept" as const,
            label: "Causal probe",
            content:
              "A probe that both hypotheses predict identically cannot separate them.",
          },
        ],
      }),
    ),
    createUnitContentIfAbsent: vi.fn(() => Promise.resolve(unit)),
    replaceUnitContent: vi.fn(() => Promise.resolve(unit)),
    withUnitBuildLock: (_nodeId, run) => run(deps),
    ...overrides,
  };
  return deps;
};

afterEach(() => {
  runSeedStageMock.mockReset();
  vi.useRealTimers();
});

describe("prepareUnitContent", () => {
  it("prepares a legacy unit without knowledge targets", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const legacyParent = planNodes[0];
    if (!legacyParent) throw new Error("Expected a legacy parent node.");
    const legacyNodes = [
      { ...legacyParent, kind: "root", skillMap: undefined },
      { ...planNode, parentNodeId: "cluster-1" },
    ];
    const result = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps: makeDeps({
          getPlanNodesBySession: vi.fn(() => Promise.resolve(legacyNodes)),
          getUnitKnowledgeContext: vi.fn(() => Promise.resolve(null)),
        }),
      }),
    );

    expect(result).toBe(unit);
  });

  it("short-circuits an existing row without spending an LLM call", async () => {
    const deps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(unit)),
    });

    const result = await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(result).toBe(unit);
    expect(runSeedStageMock).not.toHaveBeenCalled();
    expect(deps.getPlanNodesBySession).not.toHaveBeenCalled();
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
    expect(deps.replaceUnitContent).not.toHaveBeenCalled();
  });

  it("retries a provider failure and then persists the successful scaffold", async () => {
    runSeedStageMock
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(setup);
    const deps = makeDeps();

    const result = await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(result).toBe(unit);
    expect(runSeedStageMock).toHaveBeenCalledTimes(2);
    expect(deps.createUnitContentIfAbsent).toHaveBeenCalledTimes(1);
    expect(deps.replaceUnitContent).not.toHaveBeenCalled();
  });

  it("uses replacement only for a deliberate legacy refresh", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const deps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(unit)),
    });

    const result = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps,
        forceRefresh: true,
      }),
    );

    expect(result).toBe(unit);
    expect(deps.replaceUnitContent).toHaveBeenCalledTimes(1);
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
  });

  it("does not call the model or retry when required context is missing", async () => {
    const deps = makeDeps({
      getTargetIdentity: vi.fn(() => Promise.resolve(null)),
    });

    const exit = await Effect.runPromiseExit(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitContextMissingError");
    }
    expect(runSeedStageMock).not.toHaveBeenCalled();
  });

  it("turns an exhausted model timeout into UnitScaffoldError", async () => {
    vi.useFakeTimers();
    runSeedStageMock.mockImplementation(() => new Promise(() => undefined));
    const deps = makeDeps();

    const resultPromise = Effect.runPromiseExit(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );
    await vi.advanceTimersByTimeAsync(140_000);
    const exit = await resultPromise;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitScaffoldError");
      expect(String(exit.cause)).toContain("timed out");
    }
    expect(runSeedStageMock).toHaveBeenCalledTimes(3);
  });

  it("tags a write failure as UnitPersistError without regenerating", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const deps = makeDeps({
      createUnitContentIfAbsent: vi.fn(() =>
        Promise.reject(new Error("db down")),
      ),
    });

    const exit = await Effect.runPromiseExit(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitPersistError");
    }
    expect(runSeedStageMock).toHaveBeenCalledTimes(1);
    expect(deps.createUnitContentIfAbsent).toHaveBeenCalledTimes(1);
  });
});
