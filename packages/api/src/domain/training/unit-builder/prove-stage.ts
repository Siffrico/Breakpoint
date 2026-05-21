import { runAgent } from "../orchestration/agent-runtime";
import {
  getBuildContentSection,
  PracticeEvaluationSchema,
} from "@acme/validators";
import type {
  PracticeEvaluation,
  PracticePrompt,
  TeachbackMessage,
} from "../types/training.types";
import {
  ProveStageGenerationSchema,
  ProveStageInputSchema,
  ProveStageReviewSchema,
  type StageTeachbackSetup,
  type ProveStageGeneration,
  type ProveStageInput,
  type ProveStageReview,
} from "./contracts";

const PROVE_STAGE_SYSTEM = `You are Breakpoint's prove-stage agent inside the education-unit-builder.

Your job is to determine whether the learner can actually use the model from the Build stage.

You are responsible for:
- creating retrieval and application prompts that expose weak understanding
- designing a teach-back ladder that escalates pressure
- evaluating whether the learner genuinely demonstrated usable understanding

Standards:
- proving is about application, transfer, discrimination, and mechanism
- generic paraphrase does not count
- confidence does not count
- vague answers fail
- every prove artifact should make fake understanding obvious`;

export const generateProveStage = async (
  input: ProveStageInput,
): Promise<ProveStageGeneration> => {
  ProveStageInputSchema.parse(input);

  return runAgent({
    agent: "failureIsolation",
    system: PROVE_STAGE_SYSTEM,
    schema: ProveStageGenerationSchema,
    errorMessage: "Failed to generate the prove stage.",
    prompt: `Generate the Prove stage for this education unit.

Requirements:
- Return exactly 3 practicePrompts in this order: identification, construction, debugging.
- Make weak responses fail obviously.
- identification should test whether the learner can use the model from the [model] section.
- construction should extend the [worked_example] section into a new build or design task.
- debugging should target the [misconception] section when present; otherwise target the central failure mode exposed by [disrupt] and [model].
- The debugging scenario must be adjacent to the concept, not the same domain.
- teachbackSetup.openingMisconception should be plausible but wrong.
- teachbackSetup.roundLadder must escalate across 3 rounds:
  1. surface misconception
  2. structural challenge
  3. edge case or transfer stress test
- passSignals and failureModes should be usable by later evaluation.
- evaluationExpectations should summarize what counts as real proof.

Context:
${formatProveStageInput(input)}`,
  });
};

export const evaluatePracticeRound = async ({
  buildContent,
  practicePrompt,
  unitTitle,
  userResponse,
}: {
  buildContent: string;
  practicePrompt: PracticePrompt;
  unitTitle: string;
  userResponse: string;
}): Promise<PracticeEvaluation> =>
  runAgent({
    agent: "failureIsolation",
    system: PROVE_STAGE_SYSTEM,
    schema: PracticeEvaluationSchema,
    errorMessage: "Failed to evaluate the practice response.",
    prompt: `Evaluate this Prove-stage practice response.

Evaluation standards:
- pass only when the learner uses the Build-stage model correctly
- vague application fails
- generic explanation fails
- naming the principle without applying it fails
- feedback must explain what is missing or what was done well

Round type: ${practicePrompt.type}
Unit title: ${unitTitle}
Practice prompt:
${practicePrompt.prompt}

Build content:
${buildContent}

Learner response:
${userResponse}`,
  });

export const getTeachbackStudentReply = ({
  teachbackSetup,
  round,
}: {
  teachbackSetup: StageTeachbackSetup;
  round: number;
}): { studentReply: string } => {
  const objection = teachbackSetup.roundLadder[round - 1];
  if (!objection) {
    throw new Error("Teach-back objection is missing for this round.");
  }

  return { studentReply: objection.objection };
};

export const reviewTeachbackProof = async ({
  buildContent,
  proveStage,
  practiceResponses,
  teachbackTranscript,
  unitTitle,
}: {
  buildContent: string;
  proveStage: ProveStageGeneration;
  practiceResponses: Array<{
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }>;
  teachbackTranscript: TeachbackMessage[];
  unitTitle: string;
}): Promise<ProveStageReview> =>
  runAgent({
    agent: "failureIsolation",
    system: PROVE_STAGE_SYSTEM,
    schema: ProveStageReviewSchema,
    errorMessage: "Failed to review the prove stage.",
    prompt: `Review whether the learner proved understanding.

Rules:
- verdict.passed should be true only if the learner demonstrated real conceptual command.
- Do not over-reward articulation if the reasoning is still broken.
- Use evidenceAnchors to reference exact moments in the practice and teach-back evidence.
- Judge against the Build-stage model and the Prove-stage expectations only.

Unit title: ${unitTitle}
Evaluation expectations: ${proveStage.evaluationExpectations.join("; ")}
Pass signals: ${proveStage.teachbackSetup.passSignals.join("; ")}
Failure modes: ${proveStage.teachbackSetup.failureModes.join("; ")}

Build content:
${buildContent}

Practice responses:
${formatPracticeResponses(practiceResponses)}

Teach-back transcript:
${formatTeachbackTranscript(teachbackTranscript)}`,
  });

const formatProveStageInput = (input: ProveStageInput): string =>
  `Target identity: ${input.learner.targetIdentity}
Unit title: ${input.seed.title}
Concept target: ${input.seed.conceptTarget}
Misconception target: ${input.seed.misconceptionTarget}
Complexity budget: ${input.seed.complexityBudget}
Proof targets: ${input.seed.proofTargets.join("; ")}
Core model: ${input.build.coreModel.name}
Core mechanism: ${input.build.coreModel.mechanism}
Transferable principle: ${input.build.coreModel.transferablePrinciple}
Anchor section:
${getBuildContentSection(input.build.buildContent, "anchor")?.content ?? "Not available."}

Model section:
${getBuildContentSection(input.build.buildContent, "model")?.content ?? "Not available."}

Worked example section:
${getBuildContentSection(input.build.buildContent, "worked_example")?.content ?? input.build.workedExample}

Misconception section:
${getBuildContentSection(input.build.buildContent, "misconception")?.content ?? "None included."}

Ground section:
${getBuildContentSection(input.build.buildContent, "ground")?.content ?? "Not available."}

Learner seed response:
${input.learnerSeedResponse}`;

const formatPracticeResponses = (
  practiceResponses: Array<{
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }>,
): string =>
  practiceResponses.length > 0
    ? practiceResponses
        .map(
          (response) =>
            `Round ${response.sequence + 1} | passed=${response.passed}\nResponse: ${response.response}\nFeedback: ${response.feedback}`,
        )
        .join("\n\n")
    : "No practice responses recorded.";

const formatTeachbackTranscript = (messages: TeachbackMessage[]): string =>
  messages
    .map((message) => `${message.role.toUpperCase()} (round ${message.round}): ${message.content}`)
    .join("\n");
