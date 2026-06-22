import type { PromptTemplate } from "../types";

import {
  adversarialStudentPersona,
  debriefSynthesizerPersona,
  diagnosticEnginePersona,
  ghostDesignerPersona,
  ghostGradingPersona,
  recallProbeDesignerPersona,
  recallProbeGradingPersona,
  teachbackGradingPersona,
} from "../personas";
import { ghostRubric, teachbackRubric } from "../rubrics";
import { FAILURE_ISOLATION_EXAMPLES, TEACHBACK_EXAMPLES } from "../examples";

export const legacyTeachbackRoundPrompt: PromptTemplate = {
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

export const legacyTeachbackGradingPrompt: PromptTemplate = {
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

export const legacyGhostScenarioPrompt: PromptTemplate = {
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

export const legacyGhostGradingPrompt: PromptTemplate = {
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

export const legacyForgeDebriefPrompt: PromptTemplate = {
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
