import type { PromptTemplate } from "../types";

import {
  contentArchitectPersona,
  practiceDesignerPersona,
  unitSetupDesignerPersona,
} from "../personas";

export const legacyUnitSetupPrompt: PromptTemplate = {
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

export const legacyBuildContentPrompt: PromptTemplate = {
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

export const legacyPracticePromptsPrompt: PromptTemplate = {
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
