import { runAgent } from "../orchestration/agent-runtime";
import {
  RepairStageEvaluationSchema,
  RepairStageGenerationSchema,
  RepairStageInputSchema
  
  
  
} from "./contracts";
import type {RepairStageEvaluation, RepairStageGeneration, RepairStageInput} from "./contracts";

const REPAIR_STAGE_SYSTEM = `You are Breakpoint's repair-stage agent inside the education-unit-builder.

You run only when the learner failed to prove understanding.

Your job:
- isolate the root reasoning gap
- describe the repair target precisely
- generate a transfer scenario in a new domain
- evaluate whether the learner repaired the gap in that new domain

Standards:
- diagnose one root cause, not a list of symptoms
- make the transfer scenario genuinely different from the original unit domain
- evaluate only whether the repaired reasoning transferred
- do not let general writing quality hide a reasoning failure`;

export const generateRepairStage = async (
  input: RepairStageInput,
): Promise<RepairStageGeneration> => {
  RepairStageInputSchema.parse(input);

  return runAgent({
    agent: "ghostReplay",
    system: REPAIR_STAGE_SYSTEM,
    schema: RepairStageGenerationSchema,
    errorMessage: "Failed to generate the repair stage.",
    prompt: `Generate the Repair stage for this failed education unit.

Requirements:
- gap should name the root reasoning failure behind the prove-stage failure.
- repairTarget should describe the exact skill that must transfer.
- ghostScenario must use a genuinely different domain than the original unit.
- The ghost scenario should still test the same repaired reasoning skill.
- transferFocus should summarize what later evaluation should watch for.

Unit title: ${input.unit.title}
Unit summary: ${input.unit.summary}
Original scenario: ${input.unit.scenario.title}
Focus areas: ${input.unit.scenario.focusAreas.join("; ")}
Evaluation expectations: ${input.prove.evaluationExpectations.join("; ")}
Prove-stage evidence anchors: ${input.evidence.proveReview.evidenceAnchors.join("; ")}

Build content:
${input.buildContent}

Practice responses:
${formatPracticeResponses(input.evidence.practiceResponses)}

Teach-back transcript:
${formatTeachbackTranscript(input.evidence.teachbackTranscript)}`,
  });
};

export const evaluateRepairStage = async ({
  repairStage,
  response,
}: {
  repairStage: RepairStageGeneration;
  response: string;
}): Promise<RepairStageEvaluation> =>
  runAgent({
    agent: "ghostReplay",
    system: REPAIR_STAGE_SYSTEM,
    schema: RepairStageEvaluationSchema,
    errorMessage: "Failed to evaluate the repair stage.",
    prompt: `Evaluate this Repair-stage response.

Rules:
- pass only if the learner repaired the original reasoning gap
- judge transfer of the repairTarget, not general eloquence
- transferEvidence must reference what in the response shows real repair

Original gap:
${repairStage.gap.description}
Gap type: ${repairStage.gap.gapType}
Where it broke: ${repairStage.gap.whereItBroke}

Repair target:
Skill: ${repairStage.repairTarget.skill}
Transfer objective: ${repairStage.repairTarget.transferObjective}
Success criteria: ${repairStage.repairTarget.successCriteria.join("; ")}

Ghost scenario:
Domain: ${repairStage.ghostScenario.domain}
Prompt: ${repairStage.ghostScenario.prompt}
Target depth: ${repairStage.ghostScenario.targetDepth}

Learner response:
${response}`,
  });

const formatPracticeResponses = (
  practiceResponses: RepairStageInput["evidence"]["practiceResponses"],
): string =>
  practiceResponses.length > 0
    ? practiceResponses
        .map(
          (response) =>
            `Round ${response.sequence + 1} | passed=${response.passed}\nResponse: ${response.response}\nFeedback: ${response.feedback}`,
        )
        .join("\n\n")
    : "No practice responses recorded.";

const formatTeachbackTranscript = (
  messages: RepairStageInput["evidence"]["teachbackTranscript"],
): string =>
  messages
    .map((message) => `${message.role.toUpperCase()} (round ${message.round}): ${message.content}`)
    .join("\n");
