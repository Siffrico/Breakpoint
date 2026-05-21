import type { FailureGap, ForgeUnitContent } from "../types/training.types";
import { educationUnitBuilder } from "../unit-builder/orchestrator";

export const generateGhostReplay = ({
  unitContent,
  practiceResponses,
  teachbackTranscript,
  proveReview,
}: {
  unitContent: ForgeUnitContent;
  practiceResponses: Array<{
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }>;
  teachbackTranscript: Array<{
    role: "student" | "user";
    content: string;
    round: number;
  }>;
  proveReview: {
    verdict: {
      passed: boolean;
      score: number;
      feedback: string;
    };
    evidenceAnchors: string[];
  };
}) =>
  educationUnitBuilder.generateRepair({
    unit: unitContent,
    practiceResponses,
    teachbackTranscript,
    proveReview,
  });

export const gradeGhostReplay = ({
  gap,
  unitContent,
  ghostScenario,
  response,
  repairTarget,
}: {
  gap: FailureGap;
  unitContent: ForgeUnitContent;
  ghostScenario: {
    domain: string;
    prompt: string;
    targetDepth: number;
  };
  response: string;
  repairTarget?: {
    skill: string;
    transferObjective: string;
    successCriteria: string[];
  };
}) =>
  educationUnitBuilder.evaluateRepair({
    repairStage: {
      gap,
      repairTarget:
        repairTarget ?? {
          skill: unitContent.title,
          transferObjective: unitContent.whyItMatters,
          successCriteria: unitContent.scenario.focusAreas,
        },
      ghostScenario: {
        domain: ghostScenario.domain,
        prompt: ghostScenario.prompt,
        targetDepth: ghostScenario.targetDepth,
      },
      transferFocus: unitContent.scenario.focusAreas,
    },
    response,
  });
