import type { RouterOutputs } from "@acme/api";

import { previewPlanState } from "./training-preview";

type ReadyAiWorkspace = Extract<
  RouterOutputs["training"]["aiWorkspace"],
  { kind: "ready" }
>;
type WorkspaceMessage = ReadyAiWorkspace["workspace"]["messages"][number];

export const previewEducationUnit: RouterOutputs["training"]["unit"] = {
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
      "You're building an automated research agent. Its job is to improve a small open-source language model on coding tasks. The loop works like this:\n\n1. The agent proposes an experiment (\"try this training change\")\n2. The system runs the experiment\n3. The model is evaluated on a coding benchmark\n4. The agent sees the result and proposes the next experiment\n\nAfter 50 iterations, the benchmark score has gone from 23% to 61%. Your agent looks like it's working.\n\nThen you deploy the improved model and give it to real users. Within a week, engineers are complaining. The model writes code that looks correct but has subtle logic errors that only show up at runtime. It passes unit tests but breaks in production. Users say it's actually worse than the original for real work, despite the benchmark saying it improved by 38 points.\n\nWhat went wrong? Be specific. What would you change about the loop design, the evaluation strategy, and how the agent proposes experiments — to prevent this from happening again?",
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
  checksMet: null,
  checksTotal: null,
  strengths: [],
  improvements: [],
  nextStep: null,
};

/**
 * A mid-unit transcript for the preview: four assistant turns and three
 * learner answers. The last assistant turn is the active prompt (it stays
 * expanded); the three earlier pairs collapse into submitted-answer receipts,
 * so the preview shows both states of the trail at once.
 */
const previewWorkspaceMessages: WorkspaceMessage[] = [
  {
    role: "assistant",
    content: previewEducationUnit.challenge.prompt,
    sequence: 0,
    slot: null,
    unitId: null,
  },
  {
    role: "user",
    content:
      "The agent was optimizing the benchmark, not the thing the benchmark was supposed to stand for. Fifty iterations is more than enough to find the shortcuts a fixed coding benchmark rewards — matching the shape of expected solutions, passing the visible tests — without getting better at writing correct code. So the 38-point gain is real as a benchmark number and meaningless as a capability claim.",
    sequence: 1,
    slot: null,
    unitId: null,
  },
  {
    role: "assistant",
    content:
      "You named the failure correctly: the loop's only feedback signal was a number the agent could learn to move directly, so it moved that number. That's the core of it.\n\nWhat your answer skips is **who did the overfitting**. You describe the model as having learned shortcuts, but the model was retrained fresh each round — it never saw the benchmark more than once. The thing that accumulated 50 rounds of benchmark-specific information was the *agent*, through its experiment history.\n\nThat distinction changes the fix. If the model overfits, you regularize training. If the search process overfits, no amount of training-side hygiene helps — you have to change what the search is allowed to see.\n\nSo: where exactly did the benchmark information enter the loop, and how many times?",
    sequence: 2,
    slot: null,
    unitId: null,
  },
  {
    role: "user",
    content:
      "It entered at step 4 — the agent reads the score and conditions its next proposal on it. That happens once per iteration, so 50 times. Each read is a small amount of information about the specific benchmark set, and the agent gets to keep all of it. So the search process is doing gradient descent on the benchmark using the score as its only gradient, and nothing in the loop ever penalizes a proposal that helps the score without helping real code.",
    sequence: 3,
    slot: null,
    unitId: null,
  },
  {
    role: "assistant",
    content:
      "That's the right frame — 50 reads of the same evaluation set is 50 leaks, and the agent's memory is where they accumulate.\n\nOne correction on the mechanism. You called it \"gradient descent on the benchmark,\" which is close but hides a detail that matters for the fix: the agent isn't descending a gradient, it's doing **selection over a search space using a noisy estimator**. Selection is what makes it dangerous. Every proposal that scores well gets kept, including the ones that scored well by exploiting the estimator's error rather than by improving the model.\n\nThat's why the failure was invisible: the estimator's error is exactly where selection pressure concentrates.\n\nPut numbers on it. Suppose 5% of proposals improve real coding ability, and 5% happen to exploit quirks in the benchmark set. Early on, both kinds show up at the same rate. But the exploit proposals score *higher*, because they move the measured number more directly. After 50 rounds of keeping the highest scorer, the surviving lineage is almost entirely exploits — even though the underlying rates were identical.\n\nNow give me the check. What would you add to the loop that would have caught this by iteration 10 instead of after deployment?",
    sequence: 4,
    slot: null,
    unitId: null,
  },
  {
    role: "user",
    content:
      "A held-out benchmark the agent never sees the score of. Run it every 10 iterations and compare the trend against the visible one. If the visible score keeps climbing while the held-out score is flat or dropping, the gain is exploitation and the run should stop. I'd also rotate the visible set so no single set gets read 50 times, and add a runtime check — actually execute the generated code against tests it was not selected on — because the failure mode was subtle logic errors, which a static pass rate would not show.",
    sequence: 5,
    slot: null,
    unitId: null,
  },
  {
    role: "assistant",
    content:
      "The divergence check is the right instrument, and gating the run on it is exactly the move: the held-out trend is the only signal in your design that the agent has no path to influence.\n\nOne thing to sharpen. Rotating the visible set slows leakage but doesn't stop it — the agent's memory carries across rotations, so information still accumulates in the search process. Rotation buys iterations, it doesn't change the endpoint.\n\n---\n\nNow take it somewhere else. Different setup, same shape. A team is tuning a recommendation ranker with an automated search over model configurations. The objective is offline NDCG on a logged interaction dataset. After 200 configurations, offline NDCG is up 12%. They ship the winner, and week-one engagement drops 3%.\n\nWalk through where the leak is in this loop, why offline NDCG is a compromised estimator here in a way the coding benchmark was not, and what held-out signal you would build when the ground truth only arrives a week after you need it.",
    sequence: 6,
    slot: null,
    unitId: null,
  },
];

/**
 * The workspace read the preview hydrates in place of the real query. The
 * advance gate stays locked and no scenario brief is attached, so the trail
 * renders as a live mid-unit chat rather than a completed or overlaid one.
 */
export const previewAiWorkspace: ReadyAiWorkspace = {
  kind: "ready",
  workspace: {
    plan: previewPlanState,
    projectComplete: false,
    unit: previewEducationUnit,
    state: {
      mode: "education_unit",
      promptKind: "education_unit",
      educationStage: "learning",
      interactionId: null,
      workflowId: null,
      activeUnitId: previewEducationUnit.nodeId,
      activeUnitTitle: previewEducationUnit.title,
      recallUnitId: null,
      recallUnitTitle: null,
    },
    messages: previewWorkspaceMessages,
    introMessage: null,
    unitAdvanceGate: { status: "locked" },
    scenario: null,
  },
};
