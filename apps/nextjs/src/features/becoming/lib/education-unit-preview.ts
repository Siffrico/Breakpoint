import type { RouterOutputs } from "@acme/api";

export const previewEducationUnit: RouterOutputs["becoming"]["unit"] = {
  id: "education-unit-quorum-reads",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Reason about quorum reads under replica lag",
  summary:
    "Train the learner to compute freshness guarantees from actual replica intersections instead of repeating quorum slogans.",
  whyItMatters:
    "Distributed systems engineers need to predict stale-read risk from write acknowledgements, lag, and replica selection under failure.",
  learningGoal:
    "Use quorum intersections to decide whether a read can see the latest acknowledged write. The learner should explain the guarantee from replica sets and lag, not from CAP slogans.",
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
