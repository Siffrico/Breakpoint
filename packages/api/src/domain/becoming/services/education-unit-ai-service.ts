import { z } from "zod/v4";
import {
  EducationUnitResultSchema,
  EducationUnitScenarioCardSchema,
  EducationUnitTeachExampleSchema,
  type EducationUnitAttemptMode,
  type EducationUnitConfidence,
  type EducationUnitState,
  type UnitContent,
} from "@acme/validators";

import { runAgent } from "../orchestration/agent-runtime";

const TeachPackSchema = z.object({
  conceptName: z.string().min(1),
  conceptSummary: z.string().min(1),
  attemptSignals: z.object({
    correctnessBand: z.enum(["strong", "close", "partial", "off_track"]),
    misconceptionDirection: z.string().min(1),
    reasoningStyle: z.string().min(1),
  }),
  teachExamples: z.array(EducationUnitTeachExampleSchema).min(2).max(3),
  reconnectBridge: z.string().min(1),
  evaluation: EducationUnitScenarioCardSchema,
});

const EvaluationOutcomeSchema = z.object({
  result: EducationUnitResultSchema,
  feedback: z.string().min(1),
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string().min(1)).min(1).max(3),
  improvements: z.array(z.string().min(1)).min(1).max(3),
  nextStep: z.string().min(1),
  retryScenario: EducationUnitScenarioCardSchema.nullable(),
  simplerExample: EducationUnitTeachExampleSchema.nullable(),
});

const SACTRE_SYSTEM = `You are Breakpoint's education-unit maker.

You generate and evaluate a SACTRE unit:
- Scenario
- Attempt
- Concept
- Teach
- Reconnect
- Evaluate

Quality rules:
- Teach one precise concept, not a broad topic.
- Use the learner's actual wording when possible.
- No filler pedagogy language.
- Scenario and evaluation must feel concrete and diagnostically useful.
- Reconnect must explicitly bridge to something the learner already knows.
- Evaluation must test transfer, not memorization.
- If the learner is lost, simplify without becoming patronizing.`;

export const educationUnitAiService = {
  generateTeachPack: async ({
    unit,
    attemptResponse,
    responseMode,
    confidence,
    loopCount,
    priorLearning,
  }: {
    unit: UnitContent;
    attemptResponse: string;
    responseMode: EducationUnitAttemptMode;
    confidence: EducationUnitConfidence;
    loopCount: number;
    priorLearning: Array<{
      title: string;
      score: number;
      readiness: string;
      finalArticulation: string | null;
      improvements: string[];
      failureTags: string[];
      nextStep: string;
    }>;
  }) =>
    runAgent({
      agent: "buildContent",
      system: SACTRE_SYSTEM,
      schema: TeachPackSchema,
      errorMessage: "Failed to generate the education unit.",
      prompt: `Build the Concept, Teach, Reconnect, and Evaluate steps after the learner's attempt.

Requirements:
- conceptSummary must be one sentence.
- teachExamples must move from the learner's world outward to the canonical form.
- each later example should be shorter than the previous one.
- reconnectBridge must use the pattern "This is like X you already know, except..."
- evaluation should be a new scenario with a different anchor from the original prompt.
- Keep evaluation in the same responseMode unless there is a strong reason to change it.

Unit context:
Title: ${unit.title}
Summary: ${unit.summary}
Why it matters: ${unit.whyItMatters}
Original scenario: ${unit.seedPrompt}
Scenario hint: ${unit.seedHint}
Loop count: ${loopCount}
Response mode: ${responseMode}
Self-reported confidence: ${confidence}

Prior learning:
${formatPriorLearning(priorLearning)}

Learner attempt:
${attemptResponse.trim()}`,
    }),

  evaluateTransfer: async ({
    unit,
    state,
    evaluationResponse,
  }: {
    unit: UnitContent;
    state: EducationUnitState;
    evaluationResponse: string;
  }) =>
    runAgent({
      agent: "buildContent",
      system: SACTRE_SYSTEM,
      schema: EvaluationOutcomeSchema,
      errorMessage: "Failed to evaluate the education unit.",
      prompt: `Evaluate the learner's transfer response.

Return:
- result = pass | gap | lost
- retryScenario only when result is gap or lost
- simplerExample only when result is lost

Rules:
- pass only when the learner applies the concept with visible causal structure.
- gap means the learner is partially there but needs a different scenario anchor.
- lost means the learner still lacks the concept and needs a simpler example before retrying.
- feedback should be direct and specific.
- nextStep should tell the learner exactly what changes now.

Unit:
${unit.title}

Concept:
${state.concept?.name ?? unit.title}
${state.concept?.summary ?? ""}

Teach examples:
${state.teachExamples.map((example) => `${example.label}: ${example.content}`).join("\n")}

Reconnect:
${state.reconnectBridge ?? "None"}

Evaluation scenario:
${state.evaluation?.title ?? ""}
${state.evaluation?.prompt ?? ""}

Learner evaluation response:
${evaluationResponse.trim()}`,
    }),
};

const formatPriorLearning = (
  priorLearning: Array<{
    title: string;
    score: number;
    readiness: string;
    finalArticulation: string | null;
    improvements: string[];
    failureTags: string[];
    nextStep: string;
  }>,
) =>
  priorLearning.length > 0
    ? priorLearning
        .map(
          (attempt, index) =>
            `${index + 1}. ${attempt.title} | score=${attempt.score} | readiness=${attempt.readiness} | improvements=${attempt.improvements.join("; ") || "none"} | failures=${attempt.failureTags.join("; ") || "none"} | next=${attempt.nextStep}`,
        )
        .join("\n")
    : "No prior learning recorded.";
