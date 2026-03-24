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
  buildContent: string | null;
  practicePrompts: PracticePrompt[] | null;
  teachbackSetup: {
    studentPersona: string;
    openingMisconception: string;
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
  buildContent:
    "You wrote that a mental model is basically a lens that helps you interpret situations faster by applying a pattern you've seen before. That sounds plausible until you watch two people move through the same situation with the same history and arrive at opposite decisions. Speed is not the defining feature. Plenty of bad reasoning is fast. Pattern-matching is not the defining feature either. Bias pattern-matches. Habit pattern-matches. Panic pattern-matches. The break happens when you treat any repeated pattern as if it were a model, because then instinct, superstition, and disciplined abstraction all get collapsed into one pile.\n\nA real mental model is not just a familiar lens. It is a deliberate simplification that preserves a causal structure well enough to let you predict something before reality finishes unfolding. That is why your surface definition fails. It describes the feeling of using a model, not the job the model is doing. If the structure is missing, you are not modeling the situation. You are just naming a vibe and calling it judgment. The reason strong operators value models is not that models make thinking easier. It is that they make thinking inspectable. Once a model is explicit, you can test it, compare it against another one, and see what it systematically ignores.\n\nThis matters in ordinary life more than people admit. Think about a manager planning a difficult conversation. The shallow version is \"I know this person, so I'll trust my instinct.\" The deeper version is \"If feedback threatens status, they'll defend first and process second, so I need to separate the identity hit from the operational correction.\" That second move is not faster because it is intuitive. It is stronger because it encodes a mechanism and therefore changes the way the manager acts. The model creates a better intervention.\n\nThe transferable principle is this: a model is useful only when it exposes the mechanism that makes an outcome happen.",
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
