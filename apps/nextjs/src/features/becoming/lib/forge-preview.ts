/**
 * Preview data for the Forge unit workspace.
 *
 * A Forge unit has 5 phases:
 *   1. SEED      - capture prior knowledge before content
 *   2. BUILD     - uninterrupted cognitive-conflict argument
 *   3. PRACTICE  - three deliberate application rounds
 *   4. PROVE     - teach-back dialogue with an AI student
 *   5. REPAIR    - gap diagnosis plus ghost-transfer scenario (only if prove fails)
 *
 * The debrief shows seed vs final comparison plus growth metrics.
 */

export interface PracticePrompt {
  prompt: string;
  type: "identification" | "construction" | "debugging";
}

export interface ClusterBriefing {
  briefingArc: string;
  briefingMap: Array<{
    position: number;
    role: string;
  }>;
}

export interface TeachbackMessage {
  role: "student" | "user";
  content: string;
  round: number;
}

export interface FailureGap {
  description: string;
  gapType: string;
  whereItBroke: string;
}

export interface GhostScenario {
  domain: string;
  prompt: string;
  targetDepth: number;
}

export interface ForgeDebrief {
  seedResponse: string;
  finalArticulation: string;
  growthDimensions: string[];
  score: number;
  readiness: "needs_repair" | "developing" | "ready_for_next_unit";
  strengths: string[];
  improvements: string[];
  failureTags: string[];
  nextStep: string;
}

export interface ForgeUnit {
  id: string;
  nodeId: string;
  title: string;
  summary: string;
  whyItMatters: string;
  seedPrompt: string;
  seedHint: string;
  clusterArcFrame: string | null;
  clusterBriefing: ClusterBriefing | null;
  complexityBudget: 1 | 2 | 3;
  buildContent: string | null;
  practicePrompts: PracticePrompt[] | null;
  teachbackSetup: {
    studentPersona: string;
    openingMisconception: string;
    roundLadder: Array<{
      round: number;
      objection: string;
      objective: string;
    }>;
    passSignals: string[];
    failureModes: string[];
  };
  scenario: {
    title: string;
    focusAreas: string[];
  };
}

export type ForgePhase =
  | "seed"
  | "build"
  | "practice"
  | "prove"
  | "isolation"
  | "recall"
  | "debrief";

export const previewForgeUnit: ForgeUnit = {
  id: "forge-unit-mental-models",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Mental Models for Decision-Making",
  summary:
    "Teach the learner to distinguish deliberate models from vague intuition so they can reason with sharper tools under pressure.",
  whyItMatters:
    "Operators who cannot name their model cannot inspect it, swap it, or see where it fails.",
  seedPrompt:
    "Before we teach you anything, write what you currently think a mental model is and how you believe people actually use one in real decisions.",
  seedHint:
    "Use one real decision, conversation, or judgment call you have made before. Focus on what you thought was happening underneath it, not just the outcome.",
  clusterArcFrame:
    "The first slot in this sequence establishes the basic distinction the rest of the cluster depends on. This unit matters because without a clean model of what a mental model is, later slots about choosing, stress-testing, and combining models collapse into jargon.",
  clusterBriefing: {
    briefingArc:
      "This cluster builds one operator habit: making your reasoning inspectable instead of vibe-based. The sequence starts by clarifying what a mental model actually is, because most learners confuse models with intuition, slogans, or post-hoc explanations. Once that distinction is clean, the middle of the cluster pushes on application: how to choose a model deliberately, where a model breaks under pressure, and how to notice what it leaves out. The later work matters because a model is only useful when you can test it, swap it, and explain its mechanism to someone skeptical. By the end, the learner should not just recognize the phrase 'mental model.' They should be able to use models as decision tools, diagnose weak reasoning, and defend why an explicit model beats fast but opaque judgment.",
    briefingMap: [
      {
        position: 1,
        role: "Slot 1 establishes the core distinction between explicit models and gut-feel pattern matching.",
      },
      {
        position: 2,
        role: "Slot 2 turns that distinction into a choice problem: when to use a model and what good selection looks like.",
      },
      {
        position: 3,
        role: "Slot 3 pressure-tests the model by showing how it fails, what it misses, and how to revise it under stress.",
      },
    ],
  },
  complexityBudget: 2,
  buildContent:
    `[anchor]
You wrote that a mental model is basically a lens that helps you interpret situations faster by applying a pattern you've seen before. That reveals a common starting model: you are tracking the feeling of confident interpretation, not the structure that makes the interpretation reliable.

[disrupt]
That breaks the moment two people move through the same situation with similar histories and arrive at opposite decisions. Speed is not the defining feature. Bad reasoning is often fast. Pattern-matching is not the defining feature either. Bias pattern-matches. Habit pattern-matches. Panic pattern-matches. If any repeated pattern counts as a model, then instinct, superstition, and disciplined abstraction all collapse into the same pile.

[model]
A real mental model is a deliberate simplification that preserves causal structure well enough to let you predict something before reality fully unfolds. The intuitive version is this: a model is not a vibe for reading a situation, it is a compact explanation of what is making the situation behave the way it does. The structural version is this: a model earns its keep when it identifies mechanism, lets you generate predictions, and exposes assumptions you can inspect. That is why your original definition fails. It describes the subjective experience of using a model, not the job the model is doing.

[worked_example]
Imagine a manager preparing for a hard feedback conversation. A weak approach says, "I know this person, so I'll trust my read." A stronger approach slows down and asks what mechanism will control the interaction. Here I would check whether the feedback threatens status, because status threat changes how people process information. If that mechanism is active, direct criticism will trigger defense before reflection. That tells me I should separate identity threat from operational correction. So I open by anchoring on the shared standard, then narrow to the specific behavior, then propose the adjustment. The point is not that the manager sounds smarter. The point is that the model changes the intervention because it names what is causing the likely failure.

[misconception]
Most people think a model is just a polished name for intuition because both can produce quick judgments. That sounds plausible because the output feels similar. But intuition hides its assumptions, while a model makes them inspectable. If you cannot name the mechanism, test the prediction, or compare your reasoning against an alternative, you are not using a model. You are just reacting and calling it judgment.

[ground]
This shows up in ordinary life constantly. When someone says, "I just had a feeling that meeting would go badly," they usually stop at the outcome. A model asks what mechanism made the meeting likely to fail: unclear decision rights, status threat, mixed incentives, missing information, or something else. Once the mechanism is visible, the next move stops being mystical and becomes adjustable.

[transfer]
The transferable principle is this: a model is useful only when it exposes the mechanism that makes an outcome happen.`,
  practicePrompts: [
    {
      type: "identification",
      prompt:
        "Revisit a real decision where you thought you were 'just using your judgment.' Reanalyze it using the distinction between instinct and an explicit causal model. What mechanism were you actually assuming, and where did that assumption help or mislead you?",
    },
    {
      type: "construction",
      prompt:
        "Design a simple decision check you could use before a high-stakes choice this week. Build it so it forces you to name the model, the mechanism you think is operating, and one thing the model might be missing.",
    },
    {
      type: "debugging",
      prompt:
        "A founder says her hiring process works because she trusts her read on people and can usually tell who will become a top performer in the first ten minutes. The team keeps making expensive hires who interview well but collapse under ambiguity once they start. Diagnose why the approach fails, name the broken mechanism, and propose a fix that forces explicit modeling instead of vibe-based confidence.",
    },
  ],
  teachbackSetup: {
    studentPersona:
      "A smart but skeptical peer who confuses mental models with intuition and dismisses frameworks as jargon people use when they lack real judgment.",
    openingMisconception:
      "So a mental model is just a cleaner name for gut feel, right? You're still just making a fast call and dressing it up after the fact.",
    roundLadder: [
      {
        round: 1,
        objection:
          "If both models and intuition help you move fast, why isn't this just a vocabulary upgrade?",
        objective: "Defend the difference between explicit mechanism and fast reaction.",
      },
      {
        round: 2,
        objection:
          "Real situations are messy, so how can a simplified model be safer than reading the room in real time?",
        objective: "Explain why explicit simplification is more inspectable than hidden simplification.",
      },
      {
        round: 3,
        objection:
          "How do you tell whether a model reveals a mechanism or just sounds intelligent after the fact?",
        objective: "Name the tests that distinguish causal models from post-hoc stories.",
      },
    ],
    passSignals: [
      "Names mechanism rather than repeating slogans",
      "Distinguishes explicit models from intuition cleanly",
      "Uses concrete examples to defend the claim under pressure",
    ],
    failureModes: [
      "Collapses models into gut feel or pattern recognition",
      "Gets abstract and stops naming mechanism",
      "Relies on definitions without showing application",
    ],
  },
  scenario: {
    title: "Teach-back: Mental Models",
    focusAreas: ["conceptual clarity", "causal reasoning", "handling objections"],
  },
};

export const previewSeedResponse =
  "A mental model is like a lens or framework you use to interpret situations. It helps you make sense of things faster by applying a pattern you've seen before.";

export const previewPracticeResults: Array<{
  passed: boolean;
  feedback: string;
}> = [
  {
    passed: true,
    feedback:
      "You did more than retell the situation. You named the mechanism you assumed and showed where instinct had been standing in for an explicit model.",
  },
  {
    passed: true,
    feedback:
      "This construction round works because the check forces causal thinking before action. You built a usable operating tool, not a slogan.",
  },
  {
    passed: true,
    feedback:
      "You identified the broken mechanism correctly: the founder mistakes interview fluency for evidence of performance under ambiguity. Your fix addresses the root cause by forcing explicit prediction criteria.",
  },
];

export const previewTeachbackTranscript: TeachbackMessage[] = [
  {
    role: "student",
    content:
      "So a mental model is just a cleaner name for gut feel, right? You're still just making a fast call and dressing it up after the fact.",
    round: 1,
  },
  {
    role: "user",
    content:
      "No. Gut feel is an output. A mental model is an explicit simplification of a mechanism. If I cannot name what causes the outcome, inspect that assumption, and compare it to alternatives, I am not using a model. I'm just reacting.",
    round: 1,
  },
  {
    role: "student",
    content:
      "But real situations are messy. If every model is a simplification, why should I trust one over just responding to what I see in front of me?",
    round: 2,
  },
  {
    role: "user",
    content:
      "Because you're simplifying either way. 'Just responding' hides the simplification. An explicit model lets you audit what you're assuming, test it against outcomes, and notice what it leaves out.",
    round: 2,
  },
  {
    role: "student",
    content:
      "Then how do you know whether the model is actually exposing a mechanism instead of just sounding smart?",
    round: 3,
  },
];

export const previewTeachbackResult = {
  passed: true,
  score: 88,
  feedback:
    "You defended the distinction between instinct and explicit models cleanly, kept returning to mechanism rather than jargon, and handled the trust-in-the-model objection without getting abstract.",
};

export const previewFailureGap: FailureGap = {
  description:
    "You can repeat the principle but still slip back into labeling outcomes instead of naming the mechanism producing them.",
  gapType: "mechanism-blindness",
  whereItBroke:
    "Practice round 3: you named the hiring failure as 'bad judgment' instead of identifying the specific signal mismatch driving the mistake.",
};

export const previewGhostScenario: GhostScenario = {
  domain: "urban planning",
  prompt:
    "A city rolls out a public transit redesign based on rider surveys about what commuters say they want. Usage falls after launch even though the changes tested well in listening sessions. Explain the likely mechanism behind the failure and propose a better way to model rider behavior before the next redesign.",
  targetDepth: 3,
};

export const previewForgeDebrief: ForgeDebrief = {
  seedResponse:
    "A mental model is like a lens or framework you use to interpret situations.",
  finalArticulation:
    "A mental model is not a vibe or a shortcut. It is an explicit simplification of the mechanism driving an outcome, which is why it can be tested, compared, and replaced when it stops predicting reality.",
  growthDimensions: [
    "Distinguishes explicit models from instinct instead of treating them as the same thing",
    "Connects models to mechanisms rather than surface patterns",
    "Uses models as tools for inspection and revision, not just interpretation",
  ],
  score: 84,
  readiness: "developing",
  strengths: [
    "Strong grasp of the difference between intuition and explicit causal models.",
    "Practice responses showed real transfer instead of recall.",
    "Teach-back stayed anchored in mechanism under pressure.",
  ],
  improvements: [
    "Keep naming the specific mechanism, not the broad outcome label.",
    "Stress-test your model against one credible alternative before acting.",
    "When a model fails, identify what variable or causal link you omitted.",
  ],
  failureTags: ["mechanism-clarity", "model-selection"],
  nextStep:
    "Keep using a pre-decision check that forces you to name the mechanism, the prediction it implies, and the condition that would prove the model incomplete.",
};
