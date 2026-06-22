import type { PromptTemplate } from "../types";

import { recallProbeDesignerPersona } from "../personas";

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
