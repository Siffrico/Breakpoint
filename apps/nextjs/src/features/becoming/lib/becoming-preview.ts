import type { RouterOutputs } from "@acme/api";

type OnboardingState = RouterOutputs["becoming"]["startOnboarding"];
type HomeState = RouterOutputs["becoming"]["home"];
type ProfileState = RouterOutputs["becoming"]["profile"];
type PlanState = RouterOutputs["becoming"]["activePlan"];
type LearningProject = RouterOutputs["becoming"]["listLearningProjects"][number];

export interface UnitPreviewState {
  id: string;
  nodeId: string;
  title: string;
  concept: string;
  workedExample: string;
  retrievalItems: Array<{
    prompt: string;
    intent: string;
    expectedSignals: string[];
  }>;
  scenario: {
    title: string;
    prompt: string;
    focusAreas: string[];
    successCriteria: string[];
  };
}

export interface RetrievalPreviewResult {
  score: number;
  passed: boolean;
  feedback: string[];
}

export interface DebriefPreviewResult {
  score: number;
  readiness: "needs_repair" | "developing" | "ready_for_next_unit";
  strengths: string[];
  improvements: string[];
  failureTags: string[];
  targetComparison: string;
  nextStep: string;
}

export const previewSessionId = "00000000-0000-4000-8000-000000000001";

export const previewOnboardingStates: OnboardingState[] = [
  {
    sessionId: previewSessionId,
    phase: "questioning",
    activeQuestion: {
      slot: "target_identity",
      prompt: "Who do you want to become when pressure is high and the stakes are real?",
      helper:
        "Be concrete. Name the role, posture, and standard you want to operate at.",
      sequence: 0,
    },
    transcript: [
      {
        role: "assistant",
        content:
          "Who do you want to become when pressure is high and the stakes are real?",
        sequence: 0,
        slot: "target_identity",
      },
    ],
  },
  {
    sessionId: previewSessionId,
    phase: "questioning",
    activeQuestion: {
      slot: "hard_moments",
      prompt: "Where do you currently break pattern or lose control?",
      helper:
        "Think about repeat failure loops, not one-off bad days.",
      sequence: 1,
    },
    transcript: [
      {
        role: "assistant",
        content:
          "Who do you want to become when pressure is high and the stakes are real?",
        sequence: 0,
        slot: "target_identity",
      },
      {
        role: "user",
        content:
          "I want to become the kind of founder who can think clearly, decide fast, and keep execution quality high under stress.",
        sequence: 1,
        slot: "target_identity",
      },
      {
        role: "assistant",
        content: "Where do you currently break pattern or lose control?",
        sequence: 2,
        slot: "hard_moments",
      },
    ],
  },
  {
    sessionId: previewSessionId,
    phase: "questioning",
    activeQuestion: {
      slot: "identity_friction",
      prompt: "Right before you hesitate or avoid, what tends to happen inside you?",
      helper: "Name the pattern, not the story you tell about it.",
      sequence: 2,
    },
    transcript: [
      {
        role: "assistant",
        content:
          "Who do you want to become when pressure is high and the stakes are real?",
        sequence: 0,
        slot: "target_identity",
      },
      {
        role: "user",
        content:
          "I want to become the kind of founder who can think clearly, decide fast, and keep execution quality high under stress.",
        sequence: 1,
        slot: "target_identity",
      },
      {
        role: "assistant",
        content: "Where do you currently break pattern or lose control?",
        sequence: 2,
        slot: "hard_moments",
      },
      {
        role: "user",
        content:
          "I start too many threads, avoid the hardest decision until late, and let reactive work set the tone for the day.",
        sequence: 3,
        slot: "hard_moments",
      },
      {
        role: "assistant",
        content:
          "Right before you hesitate or avoid, what tends to happen inside you?",
        sequence: 4,
        slot: "identity_friction",
      },
    ],
  },
  {
    sessionId: previewSessionId,
    phase: "ready_for_generation",
    activeQuestion: {
      slot: "constraints",
      prompt: "What in your current environment keeps pulling you back into the old version of you?",
      helper:
        "Think schedule, people, defaults, and recurring pressure.",
      sequence: 3,
    },
    transcript: [
      {
        role: "assistant",
        content:
          "Who do you want to become when pressure is high and the stakes are real?",
        sequence: 0,
        slot: "target_identity",
      },
      {
        role: "user",
        content:
          "I want to become the kind of founder who can think clearly, decide fast, and keep execution quality high under stress.",
        sequence: 1,
        slot: "target_identity",
      },
      {
        role: "assistant",
        content: "Where do you currently break pattern or lose control?",
        sequence: 2,
        slot: "hard_moments",
      },
      {
        role: "user",
        content:
          "I start too many threads, avoid the hardest decision until late, and let reactive work set the tone for the day.",
        sequence: 3,
        slot: "hard_moments",
      },
      {
        role: "assistant",
        content:
          "Right before you hesitate or avoid, what tends to happen inside you?",
        sequence: 4,
        slot: "identity_friction",
      },
      {
        role: "user",
        content:
          "I start telling myself I need one more pass before I commit. That gives fear a respectable disguise, and then I drift into research or low-stakes work.",
        sequence: 5,
        slot: "identity_friction",
      },
      {
        role: "assistant",
        content:
          "What in your current environment keeps pulling you back into the old version of you?",
        sequence: 6,
        slot: "constraints",
      },
    ],
  },
];

export const previewHomeState: HomeState = {
  targetIdentity: "Distributed Systems Engineer",
  headline:
    "Build intuition for fault tolerance, replication, and consistency by training through production-shaped systems problems.",
  planTitle: "Distributed Systems Core",
  planSummary:
    "This path starts with replication and quorum fundamentals, then moves into leader election, log ordering, and recovery behavior.",
  nextUnitTitle: "Reason about quorum reads under replica lag",
  nextUnitId: "00000000-0000-4000-8000-000000000101",
  totalUnits: 8,
  completedUnits: 3,
  activeRecallGate: null,
  blockingSignals: [
    "You know the terms but still blur consistency guarantees under partition pressure.",
    "Replica lag and read freshness tradeoffs are not yet instinctive.",
    "Failure recovery reasoning still skips the exact write and acknowledgement path.",
  ],
  lastCompletedUnit: {
    title: "Leader election failure modes",
    score: 82,
    failureTags: ["term_confusion", "timeout_reasoning"],
  },
  demonstratedCapabilities: [
    "heartbeat timeout analysis",
    "write durability tradeoff framing",
    "failure timeline reconstruction",
  ],
  nodeScores: {
    "node-cluster-1": 88,
    "00000000-0000-4000-8000-000000000101": 82,
  },
};

export const previewProfileState: ProfileState = {
  targetIdentity: "Decisive Founder Under Pressure",
  headline:
    "A calm operator who narrows noise, names the real problem, and moves the team into focused execution.",
  motivation:
    "You want to be trusted with consequential decisions because your thinking stays sharp when the environment gets messy.",
  currentBaseline:
    "You have strong instincts and urgency, but your operating rhythm gets fragmented under load. That fragmentation leaks into prioritization and communication.",
  proofOfProgress:
    "You make the primary call faster, sequence the team with less noise, and review outcomes against clear milestones instead of vibes.",
  hardMoments: [
    "Three important threads compete at once and you switch context instead of sequencing.",
    "Ambiguous product risk makes you research for too long before choosing a direction.",
    "You delay communicating partial decisions because you want the answer to feel complete.",
  ],
  constraints: [
    "The system has to work during high-context-switch weeks.",
    "Training blocks need to fit inside a real founder schedule.",
    "Improvements have to show up in team-facing execution, not private insight alone.",
  ],
  behaviorSignals: [
    "Names the primary constraint quickly.",
    "Communicates first move before all details are known.",
    "Closes loops with explicit verification.",
  ],
};

export const previewPlanState: PlanState = {
  id: "00000000-0000-4000-8000-000000000201",
  title: "Distributed Systems Core",
  summary:
    "A systems curriculum that trains replication, coordination, and recovery behavior through realistic infrastructure cases.",
  targetIdentity: "Distributed Systems Engineer",
  beforeAfter: {
    headline: "You are moving from vocabulary-level familiarity to operational systems judgment.",
    beforeSummary:
      "You can recite distributed systems concepts, but you still hesitate when asked to predict what actually happens during faults, lag, and split-brain risk.",
    afterSummary:
      "Under the same production scenario, you can trace write paths, explain stale-read risk, and choose the correct durability or coordination tradeoff.",
    contrastPairs: [
      {
        before: "You talk about consensus in abstractions.",
        after: "You reason through the exact replica and acknowledgement sequence.",
      },
      {
        before: "You memorize CAP-style slogans.",
        after: "You explain which user-visible guarantees fail under each network condition.",
      },
      {
        before: "You know recovery terminology loosely.",
        after: "You can predict how the system recovers and where data can still be lost.",
      },
    ],
    firstShift:
      "Stop treating replication and consistency as definitions to memorize. Model the system as timed messages, acknowledgements, and failure boundaries.",
  },
  nextUnitId: "00000000-0000-4000-8000-000000000101",
  nodes: [
    {
      id: "node-root",
      parentNodeId: null,
      kind: "root",
      title: "Distributed Systems Core",
      summary: "Build production-grade intuition for replicated services.",
      whyItMatters: "This becomes the standard every unit trains toward.",
      orderIndex: 0,
      depth: 0,
      positionColumn: 0,
      positionRow: 1,
      status: "completed",
    },
    {
      id: "node-cluster-1",
      parentNodeId: "node-root",
      kind: "skill_cluster",
      title: "Replication and Quorum",
      summary: "Model how writes, reads, and acknowledgements move across replicas.",
      whyItMatters: "Most distributed failures become visible here first.",
      orderIndex: 1,
      depth: 1,
      positionColumn: 1,
      positionRow: 0,
      status: "completed",
    },
    {
      id: "00000000-0000-4000-8000-000000000101",
      parentNodeId: "node-cluster-1",
      kind: "unit",
      title: "Quorum reads under replica lag",
      summary: "Decide when a read is fresh enough and what quorum size actually buys you.",
      whyItMatters: "Replica lag is where consistency claims become real.",
      orderIndex: 2,
      depth: 2,
      positionColumn: 2,
      positionRow: 0,
      status: "ready",
    },
    {
      id: "node-sim-1",
      parentNodeId: "00000000-0000-4000-8000-000000000101",
      kind: "simulation",
      title: "Cross-region checkout under partial partition",
      summary: "Diagnose stale inventory reads during a live network event.",
      whyItMatters: "This is the systems environment you are actually training for.",
      orderIndex: 3,
      depth: 3,
      positionColumn: 3,
      positionRow: 0,
      status: "planned",
    },
    {
      id: "node-cluster-2",
      parentNodeId: "node-root",
      kind: "skill_cluster",
      title: "Coordination and Recovery",
      summary: "Reason through leader election, retries, replay, and safe failover.",
      whyItMatters: "Recovery paths determine whether the system is merely slow or actually wrong.",
      orderIndex: 4,
      depth: 1,
      positionColumn: 1,
      positionRow: 2,
      status: "planned",
    },
    {
      id: "node-unit-2",
      parentNodeId: "node-cluster-2",
      kind: "unit",
      title: "Leader election without split brain",
      summary: "Analyze election timers, quorum ownership, and stale leader cleanup.",
      whyItMatters: "Coordination bugs quietly corrupt correctness guarantees.",
      orderIndex: 5,
      depth: 2,
      positionColumn: 2,
      positionRow: 2,
      status: "planned",
    },
  ],
};

export const previewLearningProjects: LearningProject[] = [
  {
    sessionId: previewSessionId,
    title: "Distributed Systems",
    headline: "Replication, quorum, leader election, and failure recovery across production-shaped scenarios.",
    status: "active",
    lessonPreview: [
      {
        id: "ds-unit-1",
        title: "Quorum reads under replica lag",
        status: "ready",
      },
      {
        id: "ds-unit-2",
        title: "Leader election without split brain",
        status: "planned",
      },
      {
        id: "ds-unit-3",
        title: "Exactly-once semantics versus idempotency",
        status: "planned",
      },
      {
        id: "ds-unit-4",
        title: "Log compaction and snapshot recovery",
        status: "planned",
      },
    ],
    updatedAt: new Date("2026-04-10T23:40:00.000Z"),
  },
  {
    sessionId: "00000000-0000-4000-8000-000000000002",
    title: "Computer Engineering",
    headline: "Digital logic, pipelining, memory hierarchy, and embedded systems performance analysis.",
    status: "active",
    lessonPreview: [
      {
        id: "ce-unit-1",
        title: "Pipeline hazards and forwarding paths",
        status: "ready",
      },
      {
        id: "ce-unit-2",
        title: "Cache associativity and miss penalties",
        status: "planned",
      },
      {
        id: "ce-unit-3",
        title: "Interrupt handling on microcontrollers",
        status: "planned",
      },
      {
        id: "ce-unit-4",
        title: "Finite-state machines for bus arbitration",
        status: "planned",
      },
    ],
    updatedAt: new Date("2026-04-10T20:10:00.000Z"),
  },
  {
    sessionId: "00000000-0000-4000-8000-000000000003",
    title: "Rust Fundamentals",
    headline: "Ownership, borrowing, lifetimes, and error handling through small programs.",
    status: "active",
    lessonPreview: [
      {
        id: "rs-unit-1",
        title: "Ownership and move semantics",
        status: "ready",
      },
      {
        id: "rs-unit-2",
        title: "References and the borrow checker",
        status: "planned",
      },
      {
        id: "rs-unit-3",
        title: "Result, Option, and the ? operator",
        status: "planned",
      },
    ],
    updatedAt: new Date("2026-04-09T14:30:00.000Z"),
  },
];

export const previewUnitState: UnitPreviewState = {
  id: "unit-quorum-reads",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Reason about quorum reads under replica lag",
  concept:
    "Quorum settings are only useful if you can trace which replicas have observed the write and whether the read set intersects that acknowledged write set.",
  workedExample:
    "A write is acknowledged by replicas A and B in a three-replica cluster. Replica C is behind by several hundred milliseconds. A later read from B and C can still return stale data if B has failed and the quorum no longer intersects the acknowledged write set the way you assumed.",
  retrievalItems: [
    {
      prompt: "What condition has to hold for a quorum read to guarantee seeing the latest committed write?",
      intent: "Check whether the learner understands quorum intersection rather than memorized formulas.",
      expectedSignals: ["intersect", "acknowledged replicas", "latest write"],
    },
    {
      prompt: "Why can replica lag still produce stale reads even when the system uses a majority write quorum?",
      intent: "Check whether the learner can connect lag to actual replica selection.",
      expectedSignals: ["read set", "stale replica", "intersection"],
    },
    {
      prompt: "What changes when one acknowledged replica fails before the client issues the read?",
      intent: "Check whether the learner updates the quorum reasoning after a topology change.",
      expectedSignals: ["available replicas", "freshness risk", "failure impact"],
    },
  ],
  scenario: {
    title: "Inventory service during cross-zone lag",
    prompt:
      "A retail inventory service replicates across three zones. Writes require two acknowledgements, and reads normally query the nearest two replicas. One zone is lagging after a network event, but traffic is still being routed to it for latency reasons. Explain when stale reads can occur and how you would adjust the read or write path to preserve correctness.",
    focusAreas: ["quorum", "replication", "read freshness"],
    successCriteria: [
      "Explains quorum intersection with the actual replica sets involved.",
      "Identifies when lag plus failure breaks the freshness assumption.",
      "Proposes a mitigation that changes either routing or quorum behavior.",
    ],
  },
};

export const previewRetrievalResult: RetrievalPreviewResult = {
  score: 86,
  passed: true,
  feedback: [
    "You separated urgency from importance instead of treating every signal as equal.",
    "Your team update focused on ownership and the next review point, which keeps execution coherent.",
    "Push the verification step even harder so the loop closes cleanly.",
  ],
};

export const previewDebriefResult: DebriefPreviewResult = {
  score: 91,
  readiness: "ready_for_next_unit",
  strengths: [
    "You named the blast radius early and gave containment priority.",
    "Your response sequence reduced ambiguity for the team.",
    "You treated verification as part of the fix, not an afterthought.",
  ],
  improvements: [
    "State the customer-facing communication trigger earlier.",
    "Name one fallback if the first fix does not hold.",
    "Tighten the timing on your second status update.",
  ],
  failureTags: [
    "communication_timing",
    "fallback_planning",
    "verification_depth",
  ],
  targetComparison:
    "This response is closer to the target identity because it stays decisive without becoming chaotic.",
  nextStep:
    "Advance to the next unit and keep training earlier communication under uncertainty.",
};
