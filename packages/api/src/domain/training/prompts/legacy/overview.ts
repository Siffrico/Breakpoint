import type { PromptTemplate } from "../types";

import { beforeAfterDesignerPersona } from "../personas";

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
