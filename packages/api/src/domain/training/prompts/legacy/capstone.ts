import type { PromptTemplate } from "../types";

import {
  buildEvaluatorPersona,
  capstoneArchitectPersona,
  debateEvaluatorPersona,
  debateOpponentPersona,
  teachAudiencePersona,
  teachEvaluatorPersona,
} from "../personas";
import {
  buildCapstoneRubric,
  debateCapstoneRubric,
  teachCapstoneRubric,
} from "../rubrics";
import { BUILD_CAPSTONE_EXAMPLES, DEBATE_CAPSTONE_EXAMPLES } from "../examples";

export const legacyCapstoneDesignPrompt: PromptTemplate = {
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
