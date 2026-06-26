import type { WorkspaceContextMove } from "../context-engine/schemas";
import type { AiModelPurpose } from "../engine/model-router";
import type {
  WorkspaceAiEducationOutput,
  WorkspaceAiEducationStage,
  WorkspaceAiEvaluationOutput,
  WorkspaceAiPromptKind,
} from "./types";

export type StepAi = "scenario" | "teaching" | "evaluation";

export type WorkspaceStepVerdict =
  | "enough"
  | "thin"
  | "good"
  | "flawed"
  | "answered"
  | "needs_retry"
  | "attempted"
  | "stuck"
  | "pass"
  | "retry"
  | "repair"
  | "patched"
  | "unclear"
  | "named"
  | "ready";

export interface StepCard {
  stepId: WorkspaceAiEducationStage;
  ai: StepAi;
  promptKind: Extract<
    WorkspaceAiPromptKind,
    "education_unit" | "evaluate_feedback"
  >;
  modelPurpose: Extract<AiModelPurpose, "education" | "evaluation">;
  contextMove: Exclude<WorkspaceContextMove, "recall">;
  instruction: string;
  verdictField:
    | "diagnosisQuality"
    | "breakdownQuality"
    | "grillQuality"
    | "solveQuality"
    | "reviewQuality"
    | "gapQuality"
    | "namingQuality"
    | "testQuality"
    | "checkQuality";
  verdicts: readonly WorkspaceStepVerdict[];
}

export interface UnitRun {
  sessionId: string;
  unitContentId: string;
  userId?: string | null;
  workflowId: string;
  currentStepId: WorkspaceAiEducationStage;
  stepScenarioCount: number;
}

export interface LearnerSkipRecord {
  userId?: string | null;
}

export const VERDICT_RULEBOOK_WORKFLOW_ID = "verdict-rulebook-v1";

export const stepCards = {
  Diagnose: {
    stepId: "Diagnose",
    ai: "scenario",
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMove: "diagnose",
    instruction:
      "Run the diagnostic scenario step. Surface the learner's current mental model with the smallest realistic prompt that exposes judgment. Return diagnosisQuality: enough when there is enough evidence to teach from, otherwise thin.",
    verdictField: "diagnosisQuality",
    verdicts: ["enough", "thin"],
  },
  BreakDown: {
    stepId: "BreakDown",
    ai: "scenario",
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMove: "diagnose",
    instruction:
      "Break Down is a learner action. Do not teach and do not solve. Ask the learner to break the problem down in their own words — the goal, the rules, what matters, and what they are assuming. Read their breakdown and return breakdownQuality: good when their framing is usable enough to solve from, otherwise flawed.",
    verdictField: "breakdownQuality",
    verdicts: ["good", "flawed"],
  },
  Grill: {
    stepId: "Grill",
    ai: "scenario",
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMove: "diagnose",
    instruction:
      "Grill is only reached when the learner's breakdown was flawed. Do not teach the answer and do not solve. Ask 2-3 pointed questions aimed at the exact spot their framing breaks, so the learner spots their own mistake. Return grillQuality: answered when they have repaired their framing enough to solve, otherwise needs_retry.",
    verdictField: "grillQuality",
    verdicts: ["answered", "needs_retry"],
  },
  Solve: {
    stepId: "Solve",
    ai: "scenario",
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMove: "guide",
    instruction:
      "Give the learner a realistic application problem that requires the mechanism, then respond to their attempt without grading as final mastery. Return solveQuality: attempted when there is a real attempt to evaluate next, otherwise stuck.",
    verdictField: "solveQuality",
    verdicts: ["attempted", "stuck"],
  },
  Review: {
    stepId: "Review",
    ai: "evaluation",
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMove: "evaluate",
    instruction:
      "Evaluate the learner's solved attempt against the private contract and visible evidence only. Return reviewQuality: pass, retry, or repair.",
    verdictField: "reviewQuality",
    verdicts: ["pass", "retry", "repair"],
  },
  TeachGap: {
    stepId: "TeachGap",
    ai: "teaching",
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMove: "teach",
    instruction:
      "Repair the narrowest missing mechanism exposed by the last failed step. Return gapQuality: patched when the repair is specific enough to re-test, otherwise unclear.",
    verdictField: "gapQuality",
    verdicts: ["patched", "unclear"],
  },
  NameIdea: {
    stepId: "NameIdea",
    ai: "teaching",
    promptKind: "education_unit",
    modelPurpose: "education",
    contextMove: "teach",
    instruction:
      "Have the learner name the transferable idea in their own words and contrast it with the tempting surrogate. Return namingQuality: named when the name preserves the mechanism, otherwise unclear.",
    verdictField: "namingQuality",
    verdicts: ["named", "unclear"],
  },
  Test: {
    stepId: "Test",
    ai: "scenario",
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMove: "transfer",
    instruction:
      "Create or run the transfer test in a changed practical context. Return testQuality: ready when there is a testable attempt for final checking, otherwise stuck.",
    verdictField: "testQuality",
    verdicts: ["ready", "stuck"],
  },
  Check: {
    stepId: "Check",
    ai: "evaluation",
    promptKind: "evaluate_feedback",
    modelPurpose: "evaluation",
    contextMove: "evaluate",
    instruction:
      "Check final transfer under the unit mastery standard. Return checkQuality: pass, retry, or repair.",
    verdictField: "checkQuality",
    verdicts: ["pass", "retry", "repair"],
  },
} satisfies Record<string, StepCard>;

export type StepId = keyof typeof stepCards;

const STEP_CARD_IDS = new Set(Object.keys(stepCards));

export const isStepId = (value: string): value is StepId =>
  STEP_CARD_IDS.has(value);

/**
 * Takes a step name and produces the matching card; fails only when the step
 * name is not part of the verdict-driven rulebook.
 */
export const getStepCard = (stepId: WorkspaceAiEducationStage): StepCard => {
  if (!isStepId(stepId)) {
    throw new Error(`Unknown workspace step: ${stepId}`);
  }

  return stepCards[stepId];
};

const NEXT_STEP_RULES = {
  Diagnose: {
    enough: "BreakDown",
    thin: "Diagnose",
  },
  BreakDown: {
    good: "Solve",
    flawed: "Grill",
  },
  Grill: {
    answered: "Solve",
    needs_retry: "Grill",
  },
  Solve: {
    attempted: "Review",
    stuck: "TeachGap",
  },
  Review: {
    pass: "NameIdea",
    retry: "Solve",
    repair: "TeachGap",
  },
  TeachGap: {
    patched: "NameIdea",
    unclear: "TeachGap",
  },
  NameIdea: {
    named: "Test",
    unclear: "NameIdea",
  },
  Test: {
    ready: "Check",
    stuck: "TeachGap",
  },
  Check: {
    pass: "completed",
    retry: "Test",
    repair: "TeachGap",
  },
} satisfies Record<
  StepId,
  Partial<Record<WorkspaceStepVerdict, WorkspaceAiEducationStage>>
>;

/**
 * Takes the finished step plus the AI's verdict word; produces the next step;
 * fails only when the rulebook has no step/verdict rule.
 */
export const decideNextStep = ({
  currentStepId,
  verdict,
  retryCount,
}: {
  currentStepId: WorkspaceAiEducationStage;
  verdict: WorkspaceStepVerdict;
  retryCount: number;
}): WorkspaceAiEducationStage => {
  if (!isStepId(currentStepId)) {
    throw new Error(`No routing rules for terminal step: ${currentStepId}`);
  }

  if (
    retryCount >= 2 &&
    (currentStepId === "Review" || currentStepId === "Check") &&
    verdict === "retry"
  ) {
    return "TeachGap";
  }

  const nextStep = (
    NEXT_STEP_RULES[currentStepId] as Partial<
      Record<WorkspaceStepVerdict, WorkspaceAiEducationStage>
    >
  )[verdict];
  if (!nextStep) {
    throw new Error(
      `No routing rule for step ${currentStepId} with verdict ${verdict}.`,
    );
  }

  return nextStep;
};

/**
 * Takes a step and known learner record; returns true when the step is not
 * needed. The default rulebook keeps all steps active until product evidence
 * supports a skip rule.
 */
export const shouldSkipStep = ({
  learner,
}: {
  stepId: WorkspaceAiEducationStage;
  learner: LearnerSkipRecord | null | undefined;
}): boolean => {
  if (!learner) {
    throw new Error("Learner record is missing.");
  }

  return false;
};

/**
 * Takes raw AI output and extracts just the verdict word for the current step;
 * fails only when the expected verdict field is absent or invalid.
 */
export const readVerdict = ({
  stepId,
  aiOutput,
}: {
  stepId: WorkspaceAiEducationStage;
  aiOutput: WorkspaceAiEducationOutput | WorkspaceAiEvaluationOutput;
}): WorkspaceStepVerdict => {
  const card = getStepCard(stepId);
  const verdict = aiOutput[card.verdictField as keyof typeof aiOutput];

  if (
    typeof verdict !== "string" ||
    !card.verdicts.includes(verdict as never)
  ) {
    throw new Error(
      `AI output for ${stepId} is missing valid ${card.verdictField}.`,
    );
  }

  return verdict as WorkspaceStepVerdict;
};
