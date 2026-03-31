import type { RouterOutputs } from "@acme/api";

export type PracticePrompt = {
  prompt: string;
  type: "identification" | "construction" | "debugging";
};

export type TeachbackMessage = {
  role: "student" | "user";
  content: string;
  round: number;
};

export type FailureGap = {
  description: string;
  gapType: string;
  whereItBroke: string;
};

export type GhostScenario = {
  domain: string;
  prompt: string;
  targetDepth: number;
};

export type ForgeDebrief = {
  seedResponse: string;
  finalArticulation: string;
  growthDimensions: string[];
  score: number;
  readiness: "needs_repair" | "developing" | "ready_for_next_unit";
  strengths: string[];
  improvements: string[];
  failureTags: string[];
  nextStep: string;
};

export type ForgePhase =
  | "seed"
  | "build"
  | "practice"
  | "prove"
  | "isolation"
  | "recall";

export const previewForgeUnit: RouterOutputs["becoming"]["unit"] = {
  id: "forge-unit-mental-models",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Mental Models for Decision-Making",
  summary:
    "Teach the learner to distinguish deliberate models from vague intuition so they can reason with sharper tools under pressure.",
  whyItMatters:
    "Operators who cannot name their model cannot inspect it, swap it, or see where it fails.",
  clusterArcFrame:
    "This first unit cleans up a distinction the rest of the sequence depends on: explicit models versus fast but opaque judgment.",
  clusterBriefing: {
    briefingArc:
      "This cluster trains the habit of making your reasoning inspectable instead of vibe-based.",
    briefingMap: [
      {
        position: 1,
        role: "Clarify what a model is.",
      },
      {
        position: 2,
        role: "Choose models deliberately under pressure.",
      },
      {
        position: 3,
        role: "Stress-test when a model breaks.",
      },
    ],
  },
  currentStep: "scenario",
  loopCount: 0,
  concept: null,
  scenario: {
    title: "The Confident Interview Read",
    prompt:
      "A founder says she can tell who will become a top performer within ten minutes of an interview because she trusts her read on people. The team keeps making expensive hires who impress in interviews but collapse once the work gets ambiguous. What do you think is actually going wrong, and what would you change first?",
    helper:
      "Start from the situation itself. Name what seems to be driving the failure and the first move you would make.",
    responseMode: "free_response",
    options: null,
  },
  attempt: null,
  teachExamples: [],
  reconnectBridge: null,
  evaluation: null,
  result: null,
  resultFeedback: null,
  score: null,
  strengths: [],
  improvements: [],
  nextStep: null,
};
