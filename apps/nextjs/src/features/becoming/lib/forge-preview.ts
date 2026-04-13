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
  id: "forge-unit-quorum-reads",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Reason about quorum reads under replica lag",
  summary:
    "Train the learner to compute freshness guarantees from actual replica intersections instead of repeating quorum slogans.",
  whyItMatters:
    "Distributed systems engineers need to predict stale-read risk from write acknowledgements, lag, and replica selection under failure.",
  clusterArcFrame:
    "This first unit establishes the replication model the rest of the sequence depends on: which replicas have seen the write, which replicas answer the read, and where those sets stop intersecting.",
  clusterBriefing: {
    briefingArc:
      "This cluster trains inspectable systems reasoning for replicated services under lag and partial failure.",
    briefingMap: [
      {
        position: 1,
        role: "Trace the write path across replicas.",
      },
      {
        position: 2,
        role: "Reason about quorum reads and freshness.",
      },
      {
        position: 3,
        role: "Stress-test the guarantees after lag or replica loss.",
      },
    ],
  },
  activeStage: "challenge",
  retryCount: 0,
  challenge: {
    title: "Read Freshness After a Partial Failure",
    prompt:
      "A service stores order state on three replicas: A, B, and C. Writes are acknowledged after any two replicas confirm. A client write is accepted by A and B, but C is behind. Moments later B becomes unavailable, and a read is served from A and C because they are the fastest reachable replicas. Explain whether the client is guaranteed to see the latest write and what assumption breaks if not.",
    helper:
      "Start with the write acknowledgement set and the read replica set. Reason from intersection, not intuition.",
    responseMode: "free_response",
    options: null,
  },
  initialResponse: null,
  diagnosticGap: null,
  conceptCorrection: null,
  workedExamples: [],
  priorKnowledgeBridge: null,
  masteryCheck: null,
  masteryCheckResponse: null,
  transferChallenge: null,
  buildResponse: null,
  implementationReview: null,
  revisedBuildResponse: null,
  assessmentStatus: null,
  assessmentFeedback: null,
  score: null,
  strengths: [],
  improvements: [],
  nextStep: null,
};
