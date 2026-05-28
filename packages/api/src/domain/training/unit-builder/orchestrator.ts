import type {
  ForgeUnitContent,
  GhostEvaluation,
  PracticeEvaluation,
  PracticePrompt,
  TeachbackMessage,
} from "../types/training.types";
import { runBuildStage } from "./build-stage";
import type {PriorLearningRecord, ProveStageGeneration, SeedStageOutput, StageTeachbackSetup, UnitBuilderContext} from "./contracts";
import {
  evaluateRepairStage,
  generateRepairStage,
} from "./repair-stage";
import {
  evaluatePracticeRound,
  generateProveStage,
  reviewTeachbackProof,
} from "./prove-stage";
import { runSeedStage } from "./seed-stage";

const createUnitBuilderContext = ({
  nodeId,
  slotKind,
  slotIndex,
  totalSlots,
  clusterContext,
  integrationContext,
  targetIdentity,
  priorLearning,
  currentUnit,
}: {
  nodeId: string;
  slotKind: "unit" | "integration";
  slotIndex: number;
  totalSlots: number;
  clusterContext: {
    title: string;
    summary: string;
    whyItMatters: string;
  } | null;
  integrationContext: {
    completedClusterTitles: string[];
  } | null;
  targetIdentity: string;
  priorLearning: PriorLearningRecord[];
  currentUnit?: {
    title: string;
    summary: string;
    whyItMatters: string;
  };
}): UnitBuilderContext => ({
  node: {
    id: nodeId,
    kind: slotKind,
    title:
      currentUnit?.title ??
      (slotKind === "integration" ? "Integration Slot" : "Unit Slot"),
    summary:
      currentUnit?.summary ??
      clusterContext?.summary ??
      "Generate the next necessary learning move for this learner.",
    whyItMatters:
      currentUnit?.whyItMatters ??
      clusterContext?.whyItMatters ??
      "This slot exists to create real transfer for the learner.",
    orderIndex: slotIndex,
  },
  planContext: {
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
  },
  learner: {
    targetIdentity,
    priorLearning,
  },
});

const hydrateSeedStageFromUnit = (unit: ForgeUnitContent): SeedStageOutput => ({
  title: unit.title,
  seedPrompt: unit.seedPrompt,
  seedHint: unit.seedHint,
  clusterArcFrame:
    unit.clusterArcFrame ??
    "This slot advances the sequence by sharpening what earlier work made possible.",
  complexityBudget: unit.complexityBudget,
  teachbackSetup: hydrateTeachbackSetup(unit),
  scenario: unit.scenario,
  conceptTarget: unit.title,
  misconceptionTarget: unit.teachbackSetup.openingMisconception,
  workedExampleBrief: unit.whyItMatters,
  proofTargets: unit.scenario.focusAreas,
});

const hydrateProveStageFromUnit = (
  unit: ForgeUnitContent,
): ProveStageGeneration => ({
  practicePrompts: unit.practicePrompts ?? [],
  teachbackSetup: hydrateTeachbackSetup(unit),
  evaluationExpectations: unit.scenario.focusAreas,
});

export const educationUnitBuilder = {
  seed: ({
    nodeId,
    slotKind,
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
    targetIdentity,
  priorLearning,
  plannedUnit,
}: {
    nodeId: string;
    slotKind: "unit" | "integration";
    slotIndex: number;
    totalSlots: number;
    clusterContext: {
      title: string;
      summary: string;
      whyItMatters: string;
    } | null;
    integrationContext: {
      completedClusterTitles: string[];
    } | null;
    targetIdentity: string;
    priorLearning: PriorLearningRecord[];
    plannedUnit?: {
      title: string;
      summary: string;
      whyItMatters: string;
    };
  }) =>
    runSeedStage(
      createUnitBuilderContext({
        nodeId,
        slotKind,
        slotIndex,
        totalSlots,
        clusterContext,
        integrationContext,
        targetIdentity,
        priorLearning,
        currentUnit: plannedUnit,
      }),
    ),

  buildAndProve: async ({
    nodeId,
    slotKind,
    slotIndex,
    totalSlots,
    clusterContext,
    integrationContext,
    targetIdentity,
    priorLearning,
    seedResponse,
    currentUnit,
  }: {
    nodeId: string;
    slotKind: "unit" | "integration";
    slotIndex: number;
    totalSlots: number;
    clusterContext: {
      title: string;
      summary: string;
      whyItMatters: string;
    } | null;
    integrationContext: {
      completedClusterTitles: string[];
    } | null;
    targetIdentity: string;
    priorLearning: PriorLearningRecord[];
    seedResponse: string;
    currentUnit: ForgeUnitContent;
  }) => {
    const context = createUnitBuilderContext({
      nodeId,
      slotKind,
      slotIndex,
      totalSlots,
      clusterContext,
      integrationContext,
      targetIdentity,
      priorLearning,
      currentUnit,
    });

    const seed = hydrateSeedStageFromUnit(currentUnit);

    const buildInput = {
      ...context,
      seed,
      learnerSeedResponse: seedResponse,
    };

    const build = await runBuildStage(buildInput);
    const prove = await generateProveStage({
      ...buildInput,
      build,
    });

    return {
      build,
      prove,
    };
  },

  evaluatePractice: ({
    buildContent,
    practicePrompt,
    unitTitle,
    userResponse,
  }: {
    buildContent: string;
    practicePrompt: PracticePrompt;
    unitTitle: string;
    userResponse: string;
  }): Promise<PracticeEvaluation> =>
    evaluatePracticeRound({
      buildContent,
      practicePrompt,
      unitTitle,
      userResponse,
    }),

  reviewProve: ({
    unit,
    practiceResponses,
    teachbackTranscript,
  }: {
    unit: ForgeUnitContent;
    practiceResponses: {
      sequence: number;
      response: string;
      feedback: string;
      passed: boolean;
    }[];
    teachbackTranscript: TeachbackMessage[];
  }) =>
    reviewTeachbackProof({
      buildContent: unit.buildContent ?? "",
      proveStage: hydrateProveStageFromUnit(unit),
      practiceResponses,
      teachbackTranscript,
      unitTitle: unit.title,
    }),

  generateRepair: ({
    unit,
    practiceResponses,
    teachbackTranscript,
    proveReview,
  }: {
    unit: ForgeUnitContent;
    practiceResponses: {
      sequence: number;
      response: string;
      feedback: string;
      passed: boolean;
    }[];
    teachbackTranscript: TeachbackMessage[];
    proveReview: Awaited<
      ReturnType<typeof reviewTeachbackProof>
    >;
  }) =>
    generateRepairStage({
      unit: {
        nodeId: unit.nodeId,
        title: unit.title,
        summary: unit.summary,
        whyItMatters: unit.whyItMatters,
        scenario: unit.scenario,
      },
      buildContent: unit.buildContent ?? "",
      prove: hydrateProveStageFromUnit(unit),
      evidence: {
        practiceResponses,
        teachbackTranscript,
        proveReview,
      },
    }),

  evaluateRepair: ({
    repairStage,
    response,
  }: {
    repairStage: Awaited<ReturnType<typeof generateRepairStage>>;
    response: string;
  }): Promise<GhostEvaluation> =>
    evaluateRepairStage({
      repairStage,
      response,
    }),
};
const hydrateTeachbackSetup = (
  unit: ForgeUnitContent,
): StageTeachbackSetup => {
  const setup = unit.teachbackSetup as Partial<StageTeachbackSetup>;

  return {
    studentPersona: setup.studentPersona ?? "Skeptical peer who wants precision, not slogans.",
    openingMisconception:
      setup.openingMisconception ??
      "This explanation sounds fine on the surface, but I still do not believe it would hold up in practice.",
    roundLadder:
      setup.roundLadder ?? [
        {
          round: 1,
          objection:
            setup.openingMisconception ??
            "I can repeat the language, but I still do not see why your model matters.",
          objective: "Force the learner to clarify the core distinction.",
        },
        {
          round: 2,
          objection:
            "That still sounds too neat. What actually breaks when the situation gets messier?",
          objective: "Stress the mechanism, not the slogan.",
        },
        {
          round: 3,
          objection:
            "Fine, but would your model still work in a different context, or is it trapped in this example?",
          objective: "Force transfer under pressure.",
        },
      ],
    passSignals: setup.passSignals ?? unit.scenario.focusAreas.slice(0, 3),
    failureModes: setup.failureModes ?? [
      "Repeats the principle without applying mechanism",
      "Answers the objection generically instead of resolving it precisely",
    ],
  };
};
