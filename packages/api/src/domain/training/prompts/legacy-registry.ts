import type { PromptTemplate } from "./types";

/**
 * Quarantined legacy prompt set.
 *
 * These templates remain only so older, non-main flows can compile while the
 * product is being collapsed onto the three-prompt AI workspace architecture.
 * New training work must import from ./registry instead.
 */

import {
  onboardingInterviewerPersona,
  identityProfilerPersona,
  contentArchitectPersona,
  practiceDesignerPersona,
  adversarialStudentPersona,
  diagnosticEnginePersona,
  teachbackGradingPersona,
  ghostGradingPersona,
  ghostDesignerPersona,
  beforeAfterDesignerPersona,
  unitSetupDesignerPersona,
  debriefSynthesizerPersona,
  buildEvaluatorPersona,
  debateEvaluatorPersona,
  teachEvaluatorPersona,
  debateOpponentPersona,
  teachAudiencePersona,
  capstoneArchitectPersona,
  recallProbeDesignerPersona,
  recallProbeGradingPersona,
} from "./personas";

import {
  teachbackRubric,
  ghostRubric,
  buildCapstoneRubric,
  debateCapstoneRubric,
  teachCapstoneRubric,
} from "./rubrics";

import {
  TEACHBACK_EXAMPLES,
  FAILURE_ISOLATION_EXAMPLES,
  BUILD_CAPSTONE_EXAMPLES,
  DEBATE_CAPSTONE_EXAMPLES,
} from "./examples";

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export const onboardingStepPrompt: PromptTemplate = {
  id: "onboarding-step",
  version: 1,
  tier: "standard",
  persona: onboardingInterviewerPersona,
  instruction: `Choose the next onboarding step.

Rules:
- The first identity question has already been asked.
- You only get 3 follow-up questions total.
- If followUpCount is below 3, you must ask another question.
- If followUpCount is 3 or more, you must return complete.
- Pick the question with the highest information gain, not the most obvious slot.
- At least 2 of the 3 follow-up questions should probe psychology, identity friction, or behavior under pressure.
- Pick exactly one slot for the next question from: hard_moments, current_baseline, identity_friction, constraints, proof_of_progress.
- Do not re-ask target_identity.
- The prompt must be concise and feel elite, not chatty.
- The helper should be one short line that tightens the answer quality, or null.`,
  retryInstructions:
    "Obey the schema exactly. Do not add commentary outside the object. Be concrete and specific.",
};

export const identityReportPrompt: PromptTemplate = {
  id: "identity-report",
  version: 1,
  tier: "critical",
  persona: identityProfilerPersona,
  instruction: `Build a structured identity profile from this onboarding transcript.

Requirements:
- The transcript comes from a sparse, high-yield 4-question onboarding. Infer carefully from what is present.
- Resolve vague traits into observable behaviors.
- Hard moments should be concrete situations, not abstractions.
- currentBaseline should sound like a real performance gap.
- proofOfProgress should describe evidence, not feelings, even if it must be inferred from the target identity and failure pattern.
- confidenceFlags should only appear if the transcript is truly underspecified.
- Keep the language sharp and useful for downstream curriculum generation.`,
  retryInstructions:
    "Obey the schema exactly. Resolve vague traits into observable behaviors. Hard moments must be concrete situations.",
};

// ---------------------------------------------------------------------------
// Curriculum
// ---------------------------------------------------------------------------

export const beforeAfterPrompt: PromptTemplate = {
  id: "before-after-profile",
  version: 1,
  tier: "standard",
  persona: beforeAfterDesignerPersona,
  instruction: `Build a before-and-after transformation reveal for this learner.

Requirements:
- headline should be a concise line about the shift underway.
- beforeSummary should describe how they operate now when the system breaks.
- afterSummary should describe how the target identity operates in the same kinds of moments.
- contrastPairs should be paired contrasts, not generic traits.
- firstShift should name the first concrete internal or behavioral shift the learner needs to make.
- Keep the language tight and specific.
- Do not invent life history.`,
  retryInstructions:
    "Obey the schema exactly. Contrast pairs must be specific and paired. Do not invent life history.",
};

// ---------------------------------------------------------------------------
// Unit content generation
// ---------------------------------------------------------------------------

export const unitSetupPrompt: PromptTemplate = {
  id: "unit-setup",
  version: 1,
  tier: "standard",
  persona: unitSetupDesignerPersona,
  instruction: `Generate the next just-in-time learning unit.

Rules:
- This unit is being generated only now, when the learner reached this slot.
- Choose the specific lesson based on the learner's prior work. Do not repeat earlier units.
- title must be concrete and specific to the lesson you choose now.
- seedPrompt must be a concrete pre-teach scenario that contains the concept without naming it.
- seedPrompt must ask the learner to judge, choose, diagnose, or explain what is happening in that situation using only what they already know.
- seedPrompt must not ask for a definition, opinion, or abstract summary of the lesson.
- seedHint must be 1 or 2 sentences that help the learner understand what kind of move to make in the situation.
- seedHint should nudge toward concrete reasoning, mechanism, tradeoffs, or a decisive next move.
- seedHint must not answer the question, define the lesson for them, or leak the build content.
- clusterArcFrame must be 1 or 2 sentences positioning this slot inside the larger sequence without teaching the lesson.
- complexityBudget must be 1, 2, or 3 based on the true teaching load of the concept.
- teachbackSetup must pressure-test the chosen lesson, not the broader cluster in general.
- scenario.focusAreas should contain 2 or 3 concrete evaluation targets.
- If slotKind is "unit", stay inside the cluster scope while advancing deeper into it.
- If slotKind is "integration", synthesize across the completed clusters rather than teaching an isolated skill.
- Respect position: earlier slots should establish leverage, later slots should push complexity, transfer, or edge cases.`,
  retryInstructions:
    "Return only title, seedPrompt, seedHint, clusterArcFrame, complexityBudget, teachbackSetup, and scenario. Make the unit feel like the next necessary step, not a generic lesson. seedHint must guide without answering.",
};

export const buildContentPrompt: PromptTemplate = {
  id: "build-content",
  version: 1,
  tier: "standard",
  persona: contentArchitectPersona,
  instruction: `Write the build content for this unit.

Rules:
1. The opening must reference something the learner specifically wrote in their seed response.
2. Return one string with exact section markers on their own lines: [anchor], [disrupt], [model], [worked_example], optional [misconception], [ground], [transfer].
3. [model] must contain at least two distinct representations of the concept.
4. [worked_example] must narrate reasoning decisions, not just the answer.
5. [ground] must show the model operating in something mundane or everyday.
6. [transfer] must end with exactly one transferable principle sentence.
7. Tone: direct, sharp, challenging, respectful. Not textbook. Not warm. Not motivational.
8. Never say "you were wrong."
9. Never use phrases like "in this section" or "we will explore."
10. No bullet lists.`,
  retryInstructions:
    "Use the exact section markers. Open by referencing the learner's actual seed response. Keep the prose under each section marker; no bullet lists.",
};

export const practicePromptsPrompt: PromptTemplate = {
  id: "practice-prompts",
  version: 1,
  tier: "standard",
  persona: practiceDesignerPersona,
  instruction: `Design the practice rounds for this learner.

Rules:
1. Return exactly 3 prompts.
2. prompts[0] must have type "identification".
3. prompts[1] must have type "construction".
4. prompts[2] must have type "debugging".
5. Identification: ask the learner to reanalyze something from their own past using the model section. If the seed includes a personal example, use it.
6. Construction: ask the learner to design or build something that extends the worked_example reasoning. It must be generative, not analytical.
7. Debugging: include a 2-3 sentence broken scenario inside the prompt. The scenario must violate the misconception or central failure mode. The learner must diagnose why it fails and propose a fix.
8. The debugging scenario must be adjacent to the unit topic, not the exact same domain.
9. Never ask for definition recall or summary.
10. Make each prompt specific enough that a vague answer will obviously fail.`,
  retryInstructions:
    "Return exactly 3 prompts in order: identification, construction, debugging. The debugging prompt must include a brief broken scenario inside the prompt.",
};

export const recallSeedReturnPrompt: PromptTemplate = {
  id: "recall-seed-return",
  version: 1,
  tier: "standard",
  persona: recallProbeDesignerPersona,
  instruction: `Generate a recall seed-return probe.

Rules:
- Show the learner their original seed reasoning and ask them to identify the specific flaw in that earlier model.
- Ask what they understand now that their earlier self did not.
- Do not ask them to re-explain the full concept from scratch.
- The prompt must feel diagnostic, not punitive.
- Keep it short enough to answer in under 2 minutes.`,
  retryInstructions:
    "Return one sharp prompt only. It must ask for diagnosis of past reasoning, not content recap.",
};

export const recallInterleavePrompt: PromptTemplate = {
  id: "recall-interleave",
  version: 1,
  tier: "standard",
  persona: recallProbeDesignerPersona,
  instruction: `Generate a recall interleave probe.

Rules:
- Use all provided unit summaries.
- The prompt must require the learner to combine concepts from each unit to solve a single problem.
- The problem must be unsolvable with any one unit alone.
- Do not let the learner answer by treating the units separately.
- Keep it tight: one scenario, one answer target.`,
  retryInstructions:
    "Return one integrated prompt only. If the learner could answer by addressing each unit separately, the prompt is invalid.",
};

export const recallCompressionPrompt: PromptTemplate = {
  id: "recall-compression",
  version: 1,
  tier: "standard",
  persona: recallProbeDesignerPersona,
  instruction: `Generate a recall compression probe.

Rules:
- Use the provided same-cluster unit summaries.
- Ask the learner to state the single principle that connects them in 1 to 3 sentences.
- The principle must be specific enough that it could not describe an unrelated cluster.
- Do not ask for a summary of each unit.`,
  retryInstructions:
    "Return one short compression prompt only. It must force principle extraction, not summary.",
};

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export const teachbackPrompt: PromptTemplate = {
  id: "teachback",
  version: 1,
  tier: "standard",
  persona: adversarialStudentPersona,
  instruction: `Continue this teach-back.

Rules:
1. Each objection must be different from the previous ones.
2. Escalation: round 1 = surface misconception, round 2 = structural challenge, round 3 = edge case or meta question.
3. If the learner was strong, acknowledge briefly and pivot harder.
4. Stay in character. Sound like a real skeptical peer.`,
  retryInstructions:
    "Stay in character. Make the new objection materially different from previous ones. Escalate sophistication for the current round.",
};

export const gradeTeachbackPrompt: PromptTemplate = {
  id: "grade-teachback",
  version: 1,
  tier: "critical",
  persona: teachbackGradingPersona,
  rubric: teachbackRubric,
  examples: TEACHBACK_EXAMPLES,
  instruction: `Grade this teach-back.

IMPORTANT: You must reason through each rubric dimension separately BEFORE emitting a score. Your reasoning field for each dimension must reference specific moments from the transcript.`,
  retryInstructions:
    "Score from 0 to 100. Pass only when the learner genuinely handled the objections. Feedback must reference specific transcript moments. Reason through each dimension before scoring.",
  antiPatterns: [
    "Scoring before reasoning through each dimension",
    "Giving a passing score to a learner who agreed with every objection",
    "Inflating scores for effort, politeness, or enthusiasm",
    "Providing feedback that doesn't reference specific transcript moments",
    "Scoring above 80 when the learner never generated an original example",
  ],
};

export const isolateFailurePrompt: PromptTemplate = {
  id: "isolate-failure",
  version: 1,
  tier: "critical",
  persona: diagnosticEnginePersona,
  examples: FAILURE_ISOLATION_EXAMPLES,
  instruction: `Isolate the failure behind this performance.

Rules:
1. Name the gap in one sentence.
2. gapType should be a precise category such as surface-level-abstraction, false-concession, example-dependency, definitional-confusion, actor-adaptation-blindspot, premature-closure, scope-collapse, or transfer-failure.
3. whereItBroke must identify the exact practice round or teach-back round where the failure became visible.`,
  retryInstructions:
    "gapType should be a short kebab-case label. whereItBroke must point to the exact practice round or teach-back moment.",
  antiPatterns: [
    "Using generic labels like 'needs more practice' or 'didn't understand fully'",
    "Naming a gap without pointing to a specific moment in the evidence",
    "Listing multiple gaps instead of identifying the root cause",
    "Confusing knowledge gaps (never learned) with reasoning gaps (learned but misapplied)",
  ],
};

export const gradeRecallProbePrompt: PromptTemplate = {
  id: "grade-recall-probe",
  version: 1,
  tier: "critical",
  persona: recallProbeGradingPersona,
  instruction: `Grade this recall probe response.

Rules:
- Evaluate whether the learner satisfied the exact recall demand.
- score must be 0 to 100.
- passed should be true only if the learner showed retained understanding strong enough to keep building on.
- feedback must identify the missing retained concept or reasoning move when the answer fails.
- decayTarget should be null on a pass and a short precise phrase on a fail.`,
  retryInstructions:
    "Return score, passed, feedback, and decayTarget only. Base the judgment on the response, not effort or tone.",
};

export const recallRepairPrompt: PromptTemplate = {
  id: "recall-repair",
  version: 1,
  tier: "standard",
  persona: recallProbeDesignerPersona,
  instruction: `Generate a recall repair prompt.

Rules:
- The learner failed a recall probe.
- Generate one focused follow-up question that targets exactly what decayed.
- Do not re-teach the concept.
- Do not broaden the task.
- The repair prompt should demand the same kind of reasoning, just more precisely.`,
  retryInstructions:
    "Return one focused repair prompt only. It should be sharper than the original, not longer or broader.",
};

export const ghostScenarioPrompt: PromptTemplate = {
  id: "ghost-scenario",
  version: 1,
  tier: "standard",
  persona: ghostDesignerPersona,
  instruction: `Generate a ghost scenario.

Rules:
1. Domain must be completely different from the unit content domain.
2. Domain must not be in previousDomains.
3. The scenario must test the same reasoning skill behind the identified gap.
4. Keep it concrete and actionable.
5. Make clear what kind of response is expected.`,
  retryInstructions:
    "Domain must be clearly different from the unit domain. Keep the prompt concrete and actionable.",
};

export const gradeGhostPrompt: PromptTemplate = {
  id: "grade-ghost",
  version: 1,
  tier: "critical",
  persona: ghostGradingPersona,
  rubric: ghostRubric,
  instruction: `Evaluate this ghost response.

IMPORTANT: The only question that matters is whether the learner demonstrated the specific reasoning skill they previously failed at, now in a new domain. Do not evaluate general quality.`,
  retryInstructions:
    "The only thing being tested is whether the response addresses the original gap. Pass threshold is 65 or above.",
};

export const forgeDebriefPrompt: PromptTemplate = {
  id: "forge-debrief",
  version: 1,
  tier: "standard",
  persona: debriefSynthesizerPersona,
  instruction: `Build a Forge debrief.

Rules:
1. finalArticulation should be a cleaned-up synthesis of their best teach-back moments, not a direct quote.
2. growthDimensions should list what they understand now that was missing from the seed.
3. Score should consider practice performance, teach-back performance, and ghost performance if present.
4. Readiness should follow these rules:
   - ready_for_next_unit: score >= 80 and teach-back passed
   - developing: score >= 60 or teach-back passed
   - needs_repair: score < 60 and teach-back failed
5. failureTags should reflect failed practice rounds, teach-back gaps, or ghost gaps.
6. nextStep should be concrete practice guidance.`,
  retryInstructions:
    "finalArticulation should synthesize the learner's best explanation. growthDimensions should contain 2 to 4 specific changes in understanding when supported by the transcript.",
};

// ---------------------------------------------------------------------------
// Capstone
// ---------------------------------------------------------------------------

export const capstoneAgentPrompt: PromptTemplate = {
  id: "capstone-agent",
  version: 1,
  tier: "critical",
  persona: capstoneArchitectPersona,
  instruction: `Create a capstone for this completed cluster.

Quality bar:
- The challenge must require integrating multiple cluster skills together.
- Avoid generic productivity advice, generic ethics debates, or fluffy explainers.
- Match the difficulty to the learner's history. If they had repeated failure tags, pressure-test those weak points.
- If build: require a specific artifact and concrete constraints.
- If debate: make the opposing stance sharp and credible.
- If teach: choose a constrained audience that forces simplification without distortion.`,
  retryInstructions:
    "Call one tool with fully valid structured inputs. Do not answer in plain prose.",
};

export const debateRoundPrompt: PromptTemplate = {
  id: "debate-round",
  version: 1,
  tier: "standard",
  persona: debateOpponentPersona,
  instruction: `Generate the assistant's next debate move.

Return a single assistant reply that advances the debate, not meta commentary.`,
  retryInstructions:
    "Stay in character. Return a single debate move, not evaluation or commentary.",
};

export const teachRoundPrompt: PromptTemplate = {
  id: "teach-round",
  version: 1,
  tier: "standard",
  persona: teachAudiencePersona,
  instruction: `Generate the audience's next reply.

Return one concise audience reply, grounded in the audience's constraints.`,
  retryInstructions:
    "Stay in character as the audience. Return one reply, not evaluation.",
};

export const evaluateBuildPrompt: PromptTemplate = {
  id: "evaluate-build",
  version: 1,
  tier: "critical",
  persona: buildEvaluatorPersona,
  rubric: buildCapstoneRubric,
  examples: BUILD_CAPSTONE_EXAMPLES,
  instruction: `Evaluate this build capstone.

IMPORTANT: Reason through each evaluation criterion separately before scoring. The feedback must be directly usable as revision guidance if passed is false.`,
  retryInstructions:
    "Score 0-100. Pass only if the artifact clearly satisfies the capstone bar. Reason through criteria before scoring.",
  antiPatterns: [
    "Passing an artifact that only applies one cluster skill",
    "Scoring before reasoning through each criterion",
    "Providing feedback that isn't revision-actionable",
  ],
};

export const evaluateDebatePrompt: PromptTemplate = {
  id: "evaluate-debate",
  version: 1,
  tier: "critical",
  persona: debateEvaluatorPersona,
  rubric: debateCapstoneRubric,
  examples: DEBATE_CAPSTONE_EXAMPLES,
  instruction: `Evaluate this debate capstone.

IMPORTANT: Reason through the full transcript before scoring. Generic rhetoric that could apply to any debate is not sufficient for a pass.`,
  retryInstructions:
    "Score 0-100. Pass only if the learner used cluster-specific concepts across the full exchange.",
  antiPatterns: [
    "Passing a learner who used generic argumentation without cluster concepts",
    "Scoring based only on the final round without considering the full exchange",
    "Conflating eloquence with conceptual application",
  ],
};

export const evaluateTeachPrompt: PromptTemplate = {
  id: "evaluate-teach",
  version: 1,
  tier: "critical",
  persona: teachEvaluatorPersona,
  rubric: teachCapstoneRubric,
  instruction: `Evaluate this teach capstone.

IMPORTANT: Evaluate accuracy and audience adaptation separately before scoring. A generic explanation that ignores audience constraints has not met the capstone bar.`,
  retryInstructions:
    "Score 0-100. Pass only if the learner taught accurately AND adapted to audience constraints.",
  antiPatterns: [
    "Passing a generic explanation that could be given to any audience",
    "Ignoring audience constraints in the evaluation",
    "Scoring based only on accuracy without considering adaptation",
  ],
};

// ---------------------------------------------------------------------------
// Registry lookup
// ---------------------------------------------------------------------------

const ALL_PROMPTS: PromptTemplate[] = [
  onboardingStepPrompt,
  identityReportPrompt,
  beforeAfterPrompt,
  unitSetupPrompt,
  buildContentPrompt,
  practicePromptsPrompt,
  teachbackPrompt,
  gradeTeachbackPrompt,
  isolateFailurePrompt,
  ghostScenarioPrompt,
  gradeGhostPrompt,
  forgeDebriefPrompt,
  capstoneAgentPrompt,
  debateRoundPrompt,
  teachRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
];

/** Lookup a prompt template by ID. Throws if not found. */
export const getPrompt = (id: string): PromptTemplate => {
  const found = ALL_PROMPTS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Prompt template not found: ${id}`);
  }
  return found;
};

/** List all registered prompt IDs and versions. */
export const listPrompts = (): { id: string; version: number; tier: string }[] =>
  ALL_PROMPTS.map((p) => ({ id: p.id, version: p.version, tier: p.tier }));
