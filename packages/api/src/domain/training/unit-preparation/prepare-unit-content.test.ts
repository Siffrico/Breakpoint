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
const baseSkillMap = {
  skills: ["Frame", "Solve", "Verify"].map((name) => ({
    name,
    description: `${name} the task.`,
    items: [
      {
        kind: "concept" as const,
        name: `${name} item`,
        description: `${name} knowledge.`,
      },
    ],
  })),
  expertJudgment: [
    { rule: "Frame before acting.", when: "The task is ambiguous." },
    { rule: "Verify before finishing.", when: "A result seems plausible." },
  ],
  commonMistakes: [
    {
      mistake: "Act before framing.",
      whyItHappens: "The first route feels obvious.",
      detectionCue: "No governing constraint is named.",
    },
    {
      mistake: "Skip verification.",
      whyItHappens: "The result looks plausible.",
      detectionCue: "No independent check appears.",
    },
  ],
};
const basePracticeContract = {
  workflow: { name: "Solve one task", steps: ["Frame.", "Solve.", "Verify."] },
  responseMode: "judge" as const,
  taskTypes: [
    {
      name: "Diagnosis",
      situation: "A realistic failure needs diagnosis.",
      learnerDoes: "Diagnose and justify.",
      output: "A defensible diagnosis.",
      taskShape: "Evidence and one decision.",
      skills: ["Frame", "Solve", "Verify"],
    },
  ],
  qualityBar: ["The diagnosis fits the evidence."],
  variationAxes: [
    { name: "Evidence", description: "The evidence changes." },
    { name: "Trap", description: "The tempting wrong cause changes." },
  ],
  evaluationCriteria: [
    {
      criterion: "The conclusion follows from the evidence.",
      skills: ["Frame", "Solve", "Verify"],
    },
  ],
  difficultyBands: [0, 1, 2].map((band) => ({
    band: band as 0 | 1 | 2,
    task: `Band ${band} task`,
    reasoning: `${band + 1} reasoning steps`,
    support: band === 0 ? "Full" : band === 1 ? "Partial" : "None",
    traps: band === 0 ? [] : ["near miss"],
  })),
  neverDo: ["Require missing evidence."],
};

const parentPlanNode = {
  id: "cluster-1",
  parentNodeId: null,
  kind: "outcome",
  title: "Diagnosis",
  summary: "Find causes before fixes.",
  whyItMatters: "Bad diagnosis compounds errors.",
  orderIndex: 0,
  status: "ready",
  outcomeResult: "Diagnose the cause from available evidence.",
  skillMap: baseSkillMap,
  practiceContract: basePracticeContract,
};
const planNodes = [parentPlanNode, planNode];

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
} satisfies SeedStageOutput;

const unitContext = {
  version: 1 as const,
  performance: parentPlanNode.outcomeResult,
  targets: [
    {
      id: "entry-1",
      skill: "Frame",
      kind: "concept" as const,
      label: "Causal probe",
      content:
        "A probe that both hypotheses predict identically cannot separate them.",
    },
  ],
  workflow: basePracticeContract.workflow,
  expertise: {
    expertJudgment: baseSkillMap.expertJudgment,
    commonMistakes: baseSkillMap.commonMistakes,
  },
  testing: {
    responseMode: basePracticeContract.responseMode,
    taskTypes: basePracticeContract.taskTypes,
    variationAxes: basePracticeContract.variationAxes,
    neverDo: basePracticeContract.neverDo,
  },
  judgment: {
    criteria: [
      {
        id: "criterion-1",
        criterion: "The conclusion follows from the evidence.",
        skills: ["Frame", "Solve", "Verify"],
      },
    ],
    qualityBar: basePracticeContract.qualityBar,
  },
};

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
  unitContext,
  difficultyBands: null,
} satisfies UnitContent;

const makeDeps = (
  overrides: Partial<UnitPreparationDependencies> = {},
): UnitPreparationDependencies => {
  const deps: UnitPreparationDependencies = {
    getUnitByNodeId: vi.fn(() => Promise.resolve(null)),
    getPlanNodesBySession: vi.fn(() => Promise.resolve(planNodes)),
    getTargetIdentity: vi.fn(() => Promise.resolve("Incident commander")),
    getUnitDifficulty: vi.fn(() =>
      Promise.resolve({ promptBlock: "## Difficulty directive", bandOrder: 1 }),
    ),
    getUnitKnowledgeContext: vi.fn(() =>
      Promise.resolve({
        workflow: { name: "Diagnose an incident", steps: ["Choose a probe"] },
        framing: null,
        checked: [],
        targets: [
          {
            id: "entry-1",
            skill: "Frame",
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
    saveNodeBriefing: vi.fn(() => Promise.resolve(null)),
    withUnitBuildLock: (_nodeId, build) => build(deps),
    ...overrides,
  };
  return deps;
};

afterEach(() => {
  runSeedStageMock.mockReset();
  vi.useRealTimers();
});

describe("prepareUnitContent", () => {
  it("rejects a unit without an outcome contract and selected targets", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const legacyParent = planNodes[0];
    if (!legacyParent) throw new Error("Expected a legacy parent node.");
    const legacyNodes = [
      { ...legacyParent, kind: "root", skillMap: undefined },
      { ...planNode, parentNodeId: "cluster-1" },
    ];
    const exit = await Effect.runPromiseExit(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps: makeDeps({
          getPlanNodesBySession: vi.fn(() => Promise.resolve(legacyNodes)),
          getUnitKnowledgeContext: vi.fn(() => Promise.resolve(null)),
        }),
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(runSeedStageMock).not.toHaveBeenCalled();
  });

  it("passes an outcome's Skill Map and Practice Contract to the seed stage", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const skillMap = {
      skills: [
        {
          name: "Read constraints",
          description: "Find the governing constraint.",
          items: [
            {
              kind: "concept" as const,
              name: "Constraint",
              description: "The text limits the defensible answer.",
            },
          ],
        },
        {
          name: "Test options",
          description: "Compare each option with the constraint.",
          items: [
            {
              kind: "mechanism" as const,
              name: "Option test",
              description: "Reject any option that violates the constraint.",
            },
          ],
        },
        {
          name: "Verify",
          description: "Confirm the surviving answer.",
          items: [
            {
              kind: "mechanism" as const,
              name: "Evidence check",
              description: "Locate the evidence that supports the survivor.",
            },
          ],
        },
      ],
      expertJudgment: [
        {
          rule: "Predict before comparing.",
          when: "Options can anchor judgment.",
        },
        {
          rule: "Require textual support.",
          when: "An option is plausible but unstated.",
        },
      ],
      commonMistakes: [
        {
          mistake: "Choose a true but unsupported answer.",
          whyItHappens: "Outside knowledge feels relevant.",
          detectionCue: "No text supports the claim.",
        },
        {
          mistake: "Choose a broad synonym.",
          whyItHappens: "It sounds fluent.",
          detectionCue: "It misses the precise constraint.",
        },
      ],
    };
    const practiceContract = {
      workflow: {
        name: "Solve one item",
        steps: [
          "Read the constraint.",
          "Test the options.",
          "Verify the survivor.",
        ],
      },
      responseMode: "select" as const,
      taskTypes: [
        {
          name: "SAT selected response",
          situation: "A passage and question.",
          learnerDoes: "Select the defensible answer.",
          output: "One selected answer.",
          taskShape: "One passage and four options.",
          skills: ["Read constraints", "Test options", "Verify"],
        },
      ],
      qualityBar: ["Exactly one option satisfies the text."],
      variationAxes: [
        { name: "Constraint location", description: "The evidence moves." },
        { name: "Distractor", description: "The near miss changes." },
      ],
      evaluationCriteria: [
        {
          criterion: "The selected answer is supported by the text.",
          skills: ["Read constraints", "Test options", "Verify"],
        },
      ],
      difficultyBands: [
        {
          band: 0 as const,
          task: "Direct",
          reasoning: "One step",
          support: "Full",
          traps: [],
        },
        {
          band: 1 as const,
          task: "Messy",
          reasoning: "Two steps",
          support: "Partial",
          traps: ["broad synonym"],
        },
        {
          band: 2 as const,
          task: "Adversarial",
          reasoning: "Three steps",
          support: "None",
          traps: ["broad synonym", "outside knowledge"],
        },
      ],
      neverDo: ["Require outside knowledge."],
    };
    const outcomeResult = "Select the single defensible answer.";
    const outcomeNodes = [
      {
        ...parentPlanNode,
        kind: "outcome",
        outcomeResult,
        skillMap,
        practiceContract,
      },
      planNode,
    ];

    await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps: makeDeps({
          getPlanNodesBySession: vi.fn(() => Promise.resolve(outcomeNodes)),
          getUnitKnowledgeContext: vi.fn(() =>
            Promise.resolve({
              workflow: practiceContract.workflow,
              framing: null,
              checked: [],
              targets: [
                {
                  id: "entry-1",
                  skill: "Read constraints",
                  kind: "concept" as const,
                  label: "Constraint",
                  content: "The text limits the defensible answer.",
                },
              ],
            }),
          ),
        }),
      }),
    );

    const seedContext = runSeedStageMock.mock.calls[0]?.[0];
    expect(seedContext?.planContext.regime).toBe("main_outcome");
    expect(seedContext?.planContext.clusterContext?.taskContract).toEqual({
      outcomeResult,
      skillMap,
      practiceContract,
    });
  });

  it("rejects an outcome missing its task-generation contract", async () => {
    const outcomeNodes = [
      { ...parentPlanNode, kind: "outcome", skillMap: {} },
      planNode,
    ];

    const exit = await Effect.runPromiseExit(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps: makeDeps({
          getPlanNodesBySession: vi.fn(() => Promise.resolve(outcomeNodes)),
        }),
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitContextMissingError");
      expect(String(exit.cause)).toContain("task-generation contract");
    }
    expect(runSeedStageMock).not.toHaveBeenCalled();
  });

  it("locks before re-checking and short-circuits an existing row", async () => {
    const lockedDeps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(unit)),
    });
    const lockedNodeIds: string[] = [];
    const withUnitBuildLock: UnitPreparationDependencies["withUnitBuildLock"] =
      (nodeId, build) => {
        lockedNodeIds.push(nodeId);
        return build(lockedDeps);
      };
    const deps = { ...lockedDeps, withUnitBuildLock };

    const result = await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(result).toBe(unit);
    expect(lockedNodeIds).toEqual([node.id]);
    expect(runSeedStageMock).not.toHaveBeenCalled();
    expect(deps.getPlanNodesBySession).not.toHaveBeenCalled();
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
    expect(deps.replaceUnitContent).not.toHaveBeenCalled();
  });

  it("singleflights scaffold and briefing work across concurrent prepares", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    let storedUnit: UnitContent | null = null;
    let lockTail = Promise.resolve();
    const createUnitContentIfAbsent = vi.fn(() => {
      storedUnit = unit;
      return Promise.resolve(unit);
    });
    const lockedDeps = makeDeps({
      getUnitByNodeId: vi.fn(() => Promise.resolve(storedUnit)),
      createUnitContentIfAbsent,
      withUnitBuildLock: async (_nodeId, build) => {
        const previous = lockTail;
        let release!: () => void;
        lockTail = new Promise<void>((resolveLock) => {
          release = resolveLock;
        });
        await previous;
        try {
          return await build(lockedDeps);
        } finally {
          release();
        }
      },
    });
    const prepareClusterBriefing = vi.fn(() =>
      Promise.resolve({
        nodeId: "cluster-1",
        briefing: {
          briefingArc: "A diagnostic sequence.",
          briefingMap: [{ position: 1, role: "Isolate the causal signal." }],
        },
      }),
    );
    const input = {
      node,
      sessionId: "session-1",
      deps: lockedDeps,
      prepareClusterBriefing,
    };

    await Promise.all([
      Effect.runPromise(prepareUnitContent(input)),
      Effect.runPromise(prepareUnitContent(input)),
    ]);

    expect(runSeedStageMock).toHaveBeenCalledTimes(1);
    expect(prepareClusterBriefing).toHaveBeenCalledTimes(1);
    expect(lockedDeps.saveNodeBriefing).toHaveBeenCalledTimes(1);
    expect(createUnitContentIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("does not fail prepared content when optional briefing persistence fails", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const deps = makeDeps({
      saveNodeBriefing: vi.fn(() =>
        Promise.reject(new Error("briefing write")),
      ),
    });

    const result = await Effect.runPromise(
      prepareUnitContent({
        node,
        sessionId: "session-1",
        deps,
        prepareClusterBriefing: () =>
          Promise.resolve({
            nodeId: "cluster-1",
            briefing: {
              briefingArc: "A diagnostic sequence.",
              briefingMap: [
                { position: 1, role: "Isolate the causal signal." },
              ],
            },
          }),
      }),
    );

    expect(result).toBe(unit);
  });

  it("does not add a second recovery loop around the seed agent", async () => {
    runSeedStageMock
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce(setup);
    const deps = makeDeps();

    const exit = await Effect.runPromiseExit(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(runSeedStageMock).toHaveBeenCalledTimes(1);
    expect(deps.createUnitContentIfAbsent).not.toHaveBeenCalled();
  });

  it("uses replacement for an explicit refresh", async () => {
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

  it("repairs prepared content that is missing its capability contract", async () => {
    runSeedStageMock.mockResolvedValue(setup);
    const deps = makeDeps({
      getUnitByNodeId: vi.fn(() =>
        Promise.resolve({ ...unit, unitContext: null }),
      ),
    });

    await Effect.runPromise(
      prepareUnitContent({ node, sessionId: "session-1", deps }),
    );

    expect(deps.replaceUnitContent).toHaveBeenCalledWith(
      expect.objectContaining({
        unitContext,
      }),
    );
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
    await vi.advanceTimersByTimeAsync(46_000);
    const exit = await resultPromise;

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("UnitScaffoldError");
      expect(String(exit.cause)).toContain("timed out");
    }
    expect(runSeedStageMock).toHaveBeenCalledTimes(1);
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
