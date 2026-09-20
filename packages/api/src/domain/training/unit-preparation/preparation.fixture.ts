import { vi } from "vitest";

import type { UnitContent } from "../types/training.types";
import type { UnitPreparationDependencies } from "./prepare-unit-content";

export const node = { id: "node-1" };
export const planNode = {
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

export const parentPlanNode = {
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

export const unitContext = {
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

export const unit = {
  id: "content-1",
  nodeId: node.id,
  title: planNode.title,
  summary: planNode.summary,
  whyItMatters: planNode.whyItMatters,
  learningGoal: planNode.summary,
  clusterArcFrame: planNode.summary,
  clusterBriefing: null,
  scenario: { title: planNode.title, focusAreas: ["Causal probe"] },
  unitContext,
  difficultyBands: null,
} satisfies UnitContent;

export const makeDeps = (
  overrides: Partial<UnitPreparationDependencies> = {},
): UnitPreparationDependencies => {
  const deps: UnitPreparationDependencies = {
    getUnitByNodeId: vi.fn(() => Promise.resolve(null)),
    getPlanNodesBySession: vi.fn(() => Promise.resolve(planNodes)),
    getUnitKnowledgeContext: vi.fn(() =>
      Promise.resolve({
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
