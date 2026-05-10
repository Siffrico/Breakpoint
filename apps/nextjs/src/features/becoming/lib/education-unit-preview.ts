import type { RouterOutputs } from "@acme/api";

export const previewEducationUnit: RouterOutputs["becoming"]["unit"] = {
  id: "education-unit-first-training-loop",
  nodeId: "00000000-0000-4000-8000-000000000101",
  title: "Unit 1 — Your First Training Loop",
  summary:
    "Train the learner to question what an accuracy number actually measures, and to separate training data performance from real-world performance.",
  whyItMatters:
    "Every ML practitioner has to learn that a high training-set score is not evidence the model will work in production — confusing the two is how broken models ship.",
  learningGoal:
    "Use the gap between training data and real-world data to explain why 97% accuracy is not yet evidence the model is ready to ship, and to name the checks that would actually justify shipping.",
  clusterArcFrame:
    "This first unit establishes the most important habit in ML: never trust a number until you know exactly which data it was computed on and how that data relates to the data the model will see in production.",
  clusterBriefing: {
    briefingArc:
      "This cluster trains the instinct to interrogate evaluation setups before celebrating results.",
    briefingMap: [
      {
        position: 1,
        role: "Question what an accuracy number is actually measuring.",
      },
      {
        position: 2,
        role: "Separate training data from held-out evaluation data.",
      },
      {
        position: 3,
        role: "Decide what evidence would actually justify shipping.",
      },
    ],
  },
  activeStage: "challenge",
  retryCount: 0,
  challenge: {
    title: "The Agent That Gamed Its Benchmark",
    prompt:
      "## The Scenario\n\nYou're building an automated research agent. Its job is to improve a small open-source language model on coding tasks. The loop works like this:\n\n1. The agent proposes an experiment (\"try this training change\")\n2. The system runs the experiment\n3. The model is evaluated on a coding benchmark\n4. The agent sees the result and proposes the next experiment\n\nAfter 50 iterations, the benchmark score has gone from 23% to 61%. Your agent looks like it's working.\n\nThen you deploy the improved model and give it to real users. Within a week, engineers are complaining. The model writes code that looks correct but has subtle logic errors that only show up at runtime. It passes unit tests but breaks in production. Users say it's actually worse than the original for real work, despite the benchmark saying it improved by 38 points.\n\nWhat went wrong? Be specific. What would you change about the loop design, the evaluation strategy, and how the agent proposes experiments — to prevent this from happening again?",
    helper:
      "*Hint: A benchmark score and a real-world outcome are not the same signal. The agent only sees one of them — and it spent 50 iterations learning to move that one number.*",
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
