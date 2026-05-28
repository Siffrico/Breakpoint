import type { FailureGap, ForgeUnitContent, TeachbackMessage } from "../types/training.types";
import {
  FailureIsolationReviewSchema
  
} from "./contracts";
import type {FailureIsolationReview} from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

const FAILURE_ISOLATION_SYSTEM = `You are Breakpoint's failure-isolation agent.

You are not a cheerleader and not a generic grader. You are a precision diagnostic evaluator.

Your job:
- decide whether the learner actually demonstrated understanding
- score the final teach-back honestly
- identify the root reasoning gap only when there is a real failure
- name the evidence that proves the diagnosis
- specify what repair would count as genuine transfer

Scoring standards:
- Passing requires real conceptual command, not eloquence.
- Vague agreement, paraphrase, or memorized explanation fails.
- Confidence does not count.
- If the learner handled the objections with mechanism, transfer, and boundaries, pass them.

Diagnostic standards:
- Name one root gap, not a shopping list of weaknesses.
- Point to exact transcript moments.
- Distinguish between lack of knowledge and collapse under transfer pressure.
- If they pass, gap must be null and repairTarget must be null.`;

export const reviewTeachbackFailure = async ({
  unitContent,
  practiceResponses,
  teachbackTranscript,
}: {
  unitContent: ForgeUnitContent;
  practiceResponses: {
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }[];
  teachbackTranscript: TeachbackMessage[];
}): Promise<FailureIsolationReview> =>
  runAgent({
    agent: "failureIsolation",
    system: FAILURE_ISOLATION_SYSTEM,
    schema: FailureIsolationReviewSchema,
    errorMessage: "Failed to isolate the learner's reasoning gap.",
    prompt: `Evaluate the learner's build cycle.

Required output rules:
- verdict.score must be 0-100.
- verdict.passed must reflect whether they genuinely demonstrated understanding.
- If verdict.passed is true, gap must be null and repairTarget must be null.
- If verdict.passed is false, gap must be concrete and specific.
- evidenceAnchors must quote or reference exact moments in the evidence.
- repairTarget should describe the transferable reasoning skill the ghost replay should test.

Unit context:
${formatUnitContext(unitContent)}

Practice responses:
${formatPracticeResponses(practiceResponses)}

Teach-back transcript:
${formatTeachbackTranscript(teachbackTranscript)}`,
  });

export const requireFailureGap = (
  review: FailureIsolationReview,
): FailureGap => {
  if (!review.gap) {
    throw new Error("Failure isolation is only available after a failed teach-back.");
  }

  return review.gap;
};

const formatUnitContext = (unitContent: ForgeUnitContent): string =>
  `Title: ${unitContent.title}
Summary: ${unitContent.summary}
Why it matters: ${unitContent.whyItMatters}
Scenario: ${unitContent.scenario.title}
Focus areas: ${unitContent.scenario.focusAreas.join("; ")}
Build content:
${unitContent.buildContent ?? "Not generated."}`;

const formatPracticeResponses = (
  practiceResponses: {
    sequence: number;
    response: string;
    feedback: string;
    passed: boolean;
  }[],
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
