import type { RouterOutputs } from "@acme/api";

type OnboardingState = RouterOutputs["training"]["startOnboarding"];
type HomeState = RouterOutputs["training"]["home"];
type ProfileState = RouterOutputs["training"]["profile"];
type PlanState = RouterOutputs["training"]["activePlan"];
type LearningProject = RouterOutputs["training"]["listLearningProjects"][number];

export interface UnitPreviewState {
  id: string;
  nodeId: string;
  title: string;
  concept: string;
  workedExample: string;
  retrievalItems: {
    prompt: string;
    intent: string;
    expectedSignals: string[];
  }[];
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
  targetIdentity: "AI Engineer",
  headline:
    "Train the operating intuition to ship LLM systems that survive contact with real traffic — drift, evals, retrieval, and latency.",
  planTitle: "AI Engineering Core",
  planSummary:
    "This path starts with how LLM serving actually behaves, then moves into evals that catch regressions, retrieval correctness, and latency-shaped system design.",
  nextUnitTitle: "Why temperature 0 is not deterministic",
  nextUnitId: "00000000-0000-4000-8000-000000000101",
  totalUnits: 8,
  completedUnits: 3,
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
  overview: null,
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
      learningGoal:
        "Use the path to reason from concrete system behavior instead of memorized labels. Each unit should make a production failure easier to predict and explain.",
      orderIndex: 0,
      depth: 0,
      positionColumn: 0,
      positionRow: 1,
      status: "completed",
      difficultyBands: null,
    },
    {
      id: "node-cluster-1",
      parentNodeId: "node-root",
      kind: "skill_cluster",
      title: "Replication and Quorum",
      summary: "Model how writes, reads, and acknowledgements move across replicas.",
      whyItMatters: "Most distributed failures become visible here first.",
      learningGoal:
        "Use this cluster to trace replication decisions through lag, quorum, and failure. By the end, stale reads should feel mechanically predictable rather than mysterious.",
      orderIndex: 1,
      depth: 1,
      positionColumn: 1,
      positionRow: 0,
      status: "completed",
      difficultyBands: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000101",
      parentNodeId: "node-cluster-1",
      kind: "unit",
      title: "Quorum reads under replica lag",
      summary: "Decide when a read is fresh enough and what quorum size actually buys you.",
      whyItMatters: "Replica lag is where consistency claims become real.",
      learningGoal:
        "Use quorum intersections to decide whether a read can see the latest acknowledged write. The learner should be able to explain the guarantee from replica sets, not slogans.",
      orderIndex: 2,
      depth: 2,
      positionColumn: 2,
      positionRow: 0,
      status: "ready",
      difficultyBands: null,
    },
    {
      id: "node-cluster-2",
      parentNodeId: "node-root",
      kind: "skill_cluster",
      title: "Coordination and Recovery",
      summary: "Reason through leader election, retries, replay, and safe failover.",
      whyItMatters: "Recovery paths determine whether the system is merely slow or actually wrong.",
      learningGoal:
        "Use this cluster to keep correctness intact while systems recover. The learner should distinguish temporary unavailability from decisions that can corrupt state.",
      orderIndex: 4,
      depth: 1,
      positionColumn: 1,
      positionRow: 2,
      status: "planned",
      difficultyBands: null,
    },
    {
      id: "node-unit-2",
      parentNodeId: "node-cluster-2",
      kind: "unit",
      title: "Leader election without split brain",
      summary: "Analyze election timers, quorum ownership, and stale leader cleanup.",
      whyItMatters: "Coordination bugs quietly corrupt correctness guarantees.",
      learningGoal:
        "Use election evidence to decide who is allowed to lead and when that authority expires. The learner should be able to prevent split brain with concrete checks.",
      orderIndex: 5,
      depth: 2,
      positionColumn: 2,
      positionRow: 2,
      status: "planned",
      difficultyBands: null,
    },
  ],
};

export const previewLearningProjects: LearningProject[] = [
  {
    sessionId: previewSessionId,
    title: "AI Engineering",
    headline:
      "Build intuition for how production LLM systems actually behave: determinism, evals, retrieval, latency, and failure modes.",
    status: "active",
    lessonPreview: [
      {
        id: "ai-unit-1",
        title: "Why temperature 0 is not deterministic",
        status: "ready",
      },
      {
        id: "ai-unit-2",
        title: "Designing evals that actually catch regressions",
        status: "planned",
      },
      {
        id: "ai-unit-3",
        title: "RAG retrieval scoring vs. answer correctness",
        status: "planned",
      },
      {
        id: "ai-unit-4",
        title: "Streaming, tool loops, and latency budgets",
        status: "planned",
      },
    ],
    updatedAt: new Date("2026-04-10T23:40:00.000Z"),
  },
  {
    sessionId: "00000000-0000-4000-8000-000000000002",
    title: "Machine Learning",
    headline:
      "Reason about gradients, generalization, and optimization the way researchers do — from loss landscapes, not slogans.",
    status: "active",
    lessonPreview: [
      {
        id: "ml-unit-1",
        title: "Why batch norm changes the loss landscape",
        status: "ready",
      },
      {
        id: "ml-unit-2",
        title: "Vanishing gradients and residual connections",
        status: "planned",
      },
      {
        id: "ml-unit-3",
        title: "Train/eval gap and the role of distribution shift",
        status: "planned",
      },
      {
        id: "ml-unit-4",
        title: "Why Adam fails on sparse rewards",
        status: "planned",
      },
    ],
    updatedAt: new Date("2026-04-10T20:10:00.000Z"),
  },
  {
    sessionId: "00000000-0000-4000-8000-000000000003",
    title: "Computer Engineering",
    headline:
      "Trace what actually happens between your program and the hardware: pipelines, caches, memory, and interrupts.",
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
        title: "Interrupt latency on microcontrollers",
        status: "planned",
      },
    ],
    updatedAt: new Date("2026-04-09T14:30:00.000Z"),
  },
];

// NOTE: `previewUnitState` feeds the legacy /ui/train preview only — that
// route is NOT the active learning surface. The real workspace preview at
// /ui/workspace uses `previewEducationUnit` in `education-unit-preview.ts`.
// If the user asks to change "the preview" / "the unit", edit that one
// first and confirm before touching this.
export const previewUnitState: UnitPreviewState = {
  id: "unit-first-training-loop",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Unit 1 — Your First Training Loop",
  concept:
    "You're given this training setup: a model that predicts whether a movie review is positive or negative, 10,000 labeled reviews to train on, and a simple loop that runs through the data, makes predictions, compares them to the correct labels, and adjusts the model after each comparison. After 10 epochs of training, the model is getting 97% accuracy.",
  workedExample:
    "Your colleague looks at the results and says: \"Ship it. 97% is basically perfect.\" You look at the results and feel uneasy. Something might be wrong — even though 97% sounds great. What's making you uneasy? What would you check before agreeing to ship it? Hint: think about where that 97% number came from — specifically, what data the model saw during training versus what data it will see in the real world.",
  retrievalItems: [
    {
      prompt:
        "What exactly is that 97% measuring? Name the data the model is being graded on and why that matters.",
      intent:
        "Check whether the learner sees that accuracy is only meaningful relative to the data it was computed on.",
      expectedSignals: ["training data", "evaluation set", "what was measured"],
    },
    {
      prompt:
        "What is the gap between the data the model saw during training and the data it will see in production?",
      intent:
        "Check whether the learner can articulate distribution shift and unseen-example risk.",
      expectedSignals: ["unseen reviews", "distribution shift", "generalization"],
    },
    {
      prompt:
        "List two concrete checks you would run before agreeing to ship this model.",
      intent:
        "Check whether the learner can translate unease into a concrete verification plan.",
      expectedSignals: ["held-out test set", "train/test split", "error analysis"],
    },
  ],
  scenario: {
    title: "Decide whether to ship",
    prompt:
      "Walk through what you would actually do before signing off on shipping. State what you would measure, on what data, what threshold would convince you the model is safe for real users, and what failure modes you would actively look for. Be specific enough that another engineer could repeat your check.",
    focusAreas: ["train/test split", "generalization", "data leakage"],
    successCriteria: [
      "Names the train vs. real-world data gap as the source of unease.",
      "Specifies a held-out evaluation set the model has never seen.",
      "Proposes a concrete acceptance bar before shipping, not just a number.",
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
    "This response is closer to the target identity because it stays decisive without training chaotic.",
  nextStep:
    "Advance to the next unit and keep training earlier communication under uncertainty.",
};
