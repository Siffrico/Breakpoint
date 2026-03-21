import type { RouterOutputs } from "@acme/api";

type OnboardingState = RouterOutputs["becoming"]["startOnboarding"];
type HomeState = RouterOutputs["becoming"]["home"];
type ProfileState = RouterOutputs["becoming"]["profile"];
type PlanState = RouterOutputs["becoming"]["activePlan"];
type UnitState = RouterOutputs["becoming"]["unit"];
type RetrievalResult = RouterOutputs["becoming"]["submitRetrieval"];
type DebriefResult = RouterOutputs["becoming"]["submitUnitResponse"];

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
      slot: "current_baseline",
      prompt: "What does your current baseline look like on an average week?",
      helper: "Include output quality, consistency, and what slips first.",
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
        content: "What does your current baseline look like on an average week?",
        sequence: 4,
        slot: "current_baseline",
      },
    ],
  },
  {
    sessionId: previewSessionId,
    phase: "questioning",
    activeQuestion: {
      slot: "constraints",
      prompt: "What constraints or realities does this path need to respect?",
      helper:
        "Time, money, family, energy, skill gaps, and environmental friction all count.",
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
        content: "What does your current baseline look like on an average week?",
        sequence: 4,
        slot: "current_baseline",
      },
      {
        role: "user",
        content:
          "I can produce solid work in bursts, but the system is inconsistent. My calendar gets fragmented and deep work usually loses.",
        sequence: 5,
        slot: "current_baseline",
      },
      {
        role: "assistant",
        content: "What constraints or realities does this path need to respect?",
        sequence: 6,
        slot: "constraints",
      },
    ],
  },
  {
    sessionId: previewSessionId,
    phase: "ready_for_generation",
    activeQuestion: {
      slot: "proof_of_progress",
      prompt: "What visible proof would tell you this identity is becoming real?",
      helper: "Name concrete behaviors and outcomes, not just feelings.",
      sequence: 4,
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
        content: "What does your current baseline look like on an average week?",
        sequence: 4,
        slot: "current_baseline",
      },
      {
        role: "user",
        content:
          "I can produce solid work in bursts, but the system is inconsistent. My calendar gets fragmented and deep work usually loses.",
        sequence: 5,
        slot: "current_baseline",
      },
      {
        role: "assistant",
        content: "What constraints or realities does this path need to respect?",
        sequence: 6,
        slot: "constraints",
      },
      {
        role: "user",
        content:
          "I have to balance product work, customer conversations, and a limited team. The system has to work even during high-context-switch weeks.",
        sequence: 7,
        slot: "constraints",
      },
      {
        role: "assistant",
        content:
          "What visible proof would tell you this identity is becoming real?",
        sequence: 8,
        slot: "proof_of_progress",
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
    "You make the primary call faster, sequence the team with less noise, and review outcomes against clear checkpoints instead of vibes.",
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

export const previewUnitState: UnitState = {
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
      expectedSignals: ["status", "owner", "next checkpoint"],
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

export const previewRetrievalResult: RetrievalResult = {
  score: 86,
  passed: true,
  feedback: [
    "You separated urgency from importance instead of treating every signal as equal.",
    "Your team update focused on ownership and next checkpoint, which keeps execution coherent.",
    "Push the verification step even harder so the loop closes cleanly.",
  ],
};

export const previewDebriefResult: DebriefResult = {
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
