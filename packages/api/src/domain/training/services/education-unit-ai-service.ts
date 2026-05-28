import { z } from "zod/v4";
import {
  EducationUnitAssessmentStatusSchema,
  EducationUnitAttemptSignalsSchema,
  EducationUnitImplementationReviewSchema,
  EducationUnitPromptCardSchema,
  EducationUnitWorkedExampleSchema
  
  
  
  
} from "@acme/validators";
import type {EducationUnitAttemptMode, EducationUnitConfidence, EducationUnitState, UnitContent} from "@acme/validators";

import { runAgent } from "../orchestration/agent-runtime";
import type { TutorContext } from "../tutor";

const ConceptLayerSchema = z.object({
  conceptName: z.string().min(1),
  conceptSummary: z.string().min(1),
  diagnosticGap: z.object({
    predictionError: z.string().min(1),
    whatHeldUp: z.string().min(1),
    whatBroke: z.string().min(1),
    attemptSignals: EducationUnitAttemptSignalsSchema,
  }),
  workedExamples: z.array(EducationUnitWorkedExampleSchema).min(2).max(3),
  priorKnowledgeBridge: z.string().min(1),
  masteryCheck: EducationUnitPromptCardSchema,
  transferChallenge: EducationUnitPromptCardSchema,
});

const MasteryCheckOutcomeSchema = z.object({
  readiness: z.enum(["ready_for_application", "retry_concept"]),
  feedback: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1).max(2),
  improvements: z.array(z.string().min(1)).min(1).max(3),
  replacementMasteryCheck: EducationUnitPromptCardSchema.nullable(),
});

const BuildReviewSchema = z.object({
  implementationReview: EducationUnitImplementationReviewSchema,
});

const FinalAssessmentSchema = z.object({
  assessmentStatus: EducationUnitAssessmentStatusSchema,
  assessmentFeedback: z.string().min(1),
  score: z.number().int().min(0).max(100),
  strengths: z.array(z.string().min(1)).min(1).max(3),
  improvements: z.array(z.string().min(1)).min(1).max(4),
  nextStep: z.string().min(1),
  retryMasteryCheck: EducationUnitPromptCardSchema.nullable(),
  retryTransferChallenge: EducationUnitPromptCardSchema.nullable(),
});

const LEARNING_LOOP_SYSTEM = `You are Breakpoint's concept-to-execution loop designer.

You are training two linked capabilities inside one unit:
- declarative understanding: can the learner name the right concept and explain why it works
- procedural execution: can the learner apply that concept in a concrete implementation path

Quality rules:
- Make the learner feel the prediction error before patching it.
- Teach the concept at the size of the learner's failure: focused enough to explain exactly what broke, complete enough to support transfer into a new scenario.
- Avoid filler pedagogy language and generic praise.
- Use concrete engineering constraints, not vague "best practice" advice.
- Procedural evaluation must inspect sequencing, primitives, verification, and failure handling.
- When a learner needs a retry, preserve momentum and narrow the fix.`;

const formatTutorContext = (context?: TutorContext | null) =>
  context
    ? `Tutor context:
${context.userPrompt}`
    : "Tutor context: Not available.";

export const educationUnitAiService = {
  generateConceptLayer: async ({
    unit,
    initialResponse,
    responseMode,
    confidence,
    retryCount,
    priorLearning,
    tutorContext,
  }: {
    unit: UnitContent;
    initialResponse: string;
    responseMode: EducationUnitAttemptMode;
    confidence: EducationUnitConfidence;
    retryCount: number;
    priorLearning: {
      title: string;
      score: number;
      readiness: string;
      finalArticulation: string | null;
      improvements: string[];
      failureTags: string[];
      nextStep: string;
    }[];
    tutorContext?: TutorContext | null;
  }) =>
    runAgent({
      agent: "buildContent",
      system: LEARNING_LOOP_SYSTEM,
      schema: ConceptLayerSchema,
      errorMessage: "Failed to generate the concept correction.",
      prompt: `Design the first half of a concept-to-execution unit.

Return:
- conceptName and a one-sentence conceptSummary
- diagnosticGap showing the learner's prediction error
- 2 or 3 workedExamples that move from intuitive to canonical
- priorKnowledgeBridge using the pattern "This is like X you already know, except..."
- masteryCheck: a small concept check
- transferChallenge: a fresh procedural challenge where the learner must operationalize the concept

Rules:
- The learner's first response should be treated as intuition, not a final answer.
- The concept correction should be surgical, contrastive, and memorable.
- masteryCheck should be small enough to answer quickly.
- transferChallenge must force implementation details, not hand-wavy architecture.
- Keep responseMode unchanged unless multiple choice would clearly improve discrimination.

Unit context:
Title: ${unit.title}
Summary: ${unit.summary}
Why it matters: ${unit.whyItMatters}
Challenge: ${unit.seedPrompt}
Hint: ${unit.seedHint}
Retry count: ${retryCount}
Response mode: ${responseMode}
Self-reported confidence: ${confidence}

Prior learning:
${formatPriorLearning(priorLearning)}

${formatTutorContext(tutorContext)}

Learner initial response:
${initialResponse.trim()}`,
    }),

  evaluateMasteryCheck: async ({
    unit,
    state,
    masteryCheckResponse,
    tutorContext,
  }: {
    unit: UnitContent;
    state: EducationUnitState;
    masteryCheckResponse: string;
    tutorContext?: TutorContext | null;
  }) =>
    runAgent({
      agent: "buildContent",
      system: LEARNING_LOOP_SYSTEM,
      schema: MasteryCheckOutcomeSchema,
      errorMessage: "Failed to grade the mastery check.",
      prompt: `Evaluate whether the learner's concept correction has stabilized enough for procedural application.

Return:
- readiness = ready_for_application | retry_concept
- direct feedback
- strengths and improvements
- replacementMasteryCheck only when readiness is retry_concept

Rules:
- ready_for_application means the learner now has the right causal concept, even if wording is imperfect.
- retry_concept means they still lack the correct mechanism or boundary conditions.
- Keep the retry targeted. Do not restart the entire unit.

Unit:
${unit.title}

Concept correction:
${state.conceptCorrection?.name ?? unit.title}
${state.conceptCorrection?.summary ?? ""}

Prediction error:
${state.diagnosticGap?.predictionError ?? "None"}

${formatTutorContext(tutorContext)}

Worked examples:
${state.workedExamples.map((example) => `${example.label}: ${example.content}`).join("\n")}

Mastery check:
${state.masteryCheck?.title ?? ""}
${state.masteryCheck?.prompt ?? ""}

Learner mastery response:
${masteryCheckResponse.trim()}`,
    }),

  reviewBuildResponse: async ({
    unit,
    state,
    buildResponse,
    tutorContext,
  }: {
    unit: UnitContent;
    state: EducationUnitState;
    buildResponse: string;
    tutorContext?: TutorContext | null;
  }) =>
    runAgent({
      agent: "buildContent",
      system: LEARNING_LOOP_SYSTEM,
      schema: BuildReviewSchema,
      errorMessage: "Failed to review the build response.",
      prompt: `Review the learner's first implementation pass before they submit a revision.

Return implementationReview with:
- summary
- 1 to 3 strengths
- 1 to 4 improvements
- requiredRevision: one concrete revision brief the learner must address next

Rules:
- Focus on procedural execution, not broad concept re-teaching.
- Inspect sequencing, primitives, invalidation/expiry, concurrency, verification, and failure handling when relevant.
- requiredRevision should force a better second pass, not just ask for "more detail."

Unit:
${unit.title}

Concept correction:
${state.conceptCorrection?.name ?? unit.title}
${state.conceptCorrection?.summary ?? ""}

Transfer challenge:
${state.transferChallenge?.title ?? ""}
${state.transferChallenge?.prompt ?? ""}

${formatTutorContext(tutorContext)}

Learner build response:
${buildResponse.trim()}`,
    }),

  evaluateRevision: async ({
    unit,
    state,
    revisionResponse,
    tutorContext,
  }: {
    unit: UnitContent;
    state: EducationUnitState;
    revisionResponse: string;
    tutorContext?: TutorContext | null;
  }) =>
    runAgent({
      agent: "buildContent",
      system: LEARNING_LOOP_SYSTEM,
      schema: FinalAssessmentSchema,
      errorMessage: "Failed to complete the final assessment.",
      prompt: `Evaluate the learner's revised implementation response.

Return:
- assessmentStatus = pass | retry_concept | retry_application
- assessmentFeedback
- score, strengths, improvements, nextStep
- retryMasteryCheck only when assessmentStatus is retry_concept
- retryTransferChallenge only when assessmentStatus is retry_application

Rules:
- pass only when the learner demonstrates both the right concept and a credible execution path.
- retry_concept means the implementation failure reveals a still-broken mental model.
- retry_application means the concept is basically correct but the execution path is still weak.
- Prefer narrow retries over full resets.

Unit:
${unit.title}

Concept correction:
${state.conceptCorrection?.name ?? unit.title}
${state.conceptCorrection?.summary ?? ""}

Prediction error:
${state.diagnosticGap?.predictionError ?? "None"}

Transfer challenge:
${state.transferChallenge?.title ?? ""}
${state.transferChallenge?.prompt ?? ""}

${formatTutorContext(tutorContext)}

First build response:
${state.buildResponse?.response ?? ""}

Implementation review:
${state.implementationReview?.summary ?? ""}
Required revision: ${state.implementationReview?.requiredRevision ?? ""}

Learner revised build response:
${revisionResponse.trim()}`,
    }),
};

const formatPriorLearning = (
  priorLearning: {
    title: string;
    score: number;
    readiness: string;
    finalArticulation: string | null;
    improvements: string[];
    failureTags: string[];
    nextStep: string;
  }[],
) =>
  priorLearning.length > 0
    ? priorLearning
        .map(
          (attempt, index) =>
            `${index + 1}. ${attempt.title} | score=${attempt.score} | readiness=${attempt.readiness} | improvements=${attempt.improvements.join("; ") || "none"} | failures=${attempt.failureTags.join("; ") || "none"} | next=${attempt.nextStep}`,
        )
        .join("\n")
    : "No prior learning recorded.";
