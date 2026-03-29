import type { RouterOutputs } from "@acme/api";

type OnboardingState = RouterOutputs["becoming"]["startOnboarding"];
type HomeState = RouterOutputs["becoming"]["home"];
type ProfileState = RouterOutputs["becoming"]["profile"];
type PlanState = RouterOutputs["becoming"]["activePlan"];

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
  targetIdentity: "Decisive Founder Under Pressure",
  headline:
    "Build calm execution under uncertainty by training diagnosis, prioritization, and clean follow-through.",
  planTitle: "Pressure Execution Sprint",
  planSummary:
    "This path starts by stabilizing your response loop under pressure, then layers on clearer communication and stronger systems judgment.",
  nextUnitTitle: "Run the first 10 minutes instead of reacting to the loudest input",
  nextUnitId: "00000000-0000-4000-8000-000000000101",
  totalUnits: 6,
  completedUnits: 2,
  blockingSignals: [
    "You default to scattered activity when multiple issues arrive at once.",
    "Hard decisions stay open too long, which amplifies second-order damage.",
    "The team gets updates late, so alignment degrades while you are still thinking.",
  ],
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
  title: "Pressure Execution Sprint",
  summary:
    "A six-node path that turns reactive work into sequenced execution by training diagnosis, communication, and durable repair.",
  targetIdentity: "Decisive Founder Under Pressure",
  beforeAfter: {
    headline: "You are moving from reactive founder energy into trusted operating judgment.",
    beforeSummary:
      "When pressure hits, you spread attention across too many threads, delay the hardest call, and let internal friction masquerade as caution.",
    afterSummary:
      "Under the same pressure, you narrow the field, make the first clean decision faster, and give the team a stable direction to execute against.",
    contrastPairs: [
      {
        before: "You react to the loudest thread first.",
        after: "You identify the real constraint and force a sequence.",
      },
      {
        before: "You hide hesitation behind extra research.",
        after: "You communicate a direction before the answer feels perfect.",
      },
      {
        before: "Your state leaks into the team as noise.",
        after: "Your judgment gives the team a calmer operating rhythm.",
      },
    ],
    firstShift:
      "Stop using more analysis to buy emotional safety. Make the first clean call while uncertainty is still present.",
  },
  nextUnitId: "00000000-0000-4000-8000-000000000101",
  nodes: [
    {
      id: "node-root",
      parentNodeId: null,
      kind: "root",
      title: "Identity Target",
      summary: "Operate calmly when multiple threads compete for attention.",
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
      title: "Triage Under Load",
      summary: "Separate urgency from noise and force clean first moves.",
      whyItMatters: "Pressure distorts prioritization first.",
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
      title: "Run the first 10 minutes",
      summary: "Train sequencing before escalation spreads.",
      whyItMatters: "Early moves shape the whole response curve.",
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
      title: "Customer fire with incomplete facts",
      summary: "Respond before you have perfect clarity.",
      whyItMatters: "Uncertainty is the actual environment.",
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
      title: "Decision Broadcast",
      summary: "Communicate partial certainty without leaking chaos.",
      whyItMatters: "Teams stall when the owner stays silent.",
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
      title: "State the direction before the whole answer exists",
      summary: "Practice crisp updates that preserve momentum.",
      whyItMatters: "Speed without clarity creates thrash.",
      orderIndex: 5,
      depth: 2,
      positionColumn: 2,
      positionRow: 2,
      status: "planned",
    },
  ],
};

export const previewUnitState: UnitPreviewState = {
  id: "unit-pressure-triage",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Run the first 10 minutes instead of reacting to the loudest input",
  concept:
    "When everything feels urgent, your first job is to identify the real constraint and force a sequence. Clear sequencing lowers stress and preserves judgment.",
  workedExample:
    "A customer issue lands while the team is already mid-launch. Strong operators first define blast radius, assign containment, and choose a communications cadence before diving into root cause.",
  retrievalItems: [
    {
      prompt: "What is the first distinction you make when multiple urgent signals arrive?",
      intent: "Check whether the learner can separate signal from noise.",
      expectedSignals: ["constraint", "blast radius", "sequence"],
    },
    {
      prompt: "Why is naming the first move early better than waiting for full certainty?",
      intent: "Check whether the learner understands momentum and coordination.",
      expectedSignals: ["alignment", "containment", "reduce drift"],
    },
    {
      prompt: "What should a good first update to the team contain?",
      intent: "Check for operational communication quality.",
      expectedSignals: ["status", "owner", "next review point"],
    },
  ],
  scenario: {
    title: "Launch-day payment failures",
    prompt:
      "A payment bug appears minutes after a product announcement. Support is seeing tickets, engineering has partial logs, and leadership wants an answer. Explain how you diagnose, contain, communicate, and verify the fix.",
    focusAreas: ["triage", "sequencing", "communication"],
    successCriteria: [
      "Names the primary risk clearly.",
      "Starts containment before root-cause certainty.",
      "Defines how the fix will be verified.",
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
