import type { RubricBlock } from "../types";

export const teachbackRubric: RubricBlock = {
  dimensions: [
    {
      name: "Conceptual accuracy",
      description:
        "Does the learner's explanation match the actual concept taught in the build content? Are there factual errors, conflations, or missing core elements?",
      weight: 25,
    },
    {
      name: "Defense quality",
      description:
        "When challenged, does the learner defend with reasoning and evidence, or do they fold, deflect, or agree without justification? Do they hold the core insight while adapting to objections?",
      weight: 30,
    },
    {
      name: "Example usage",
      description:
        "Does the learner generate concrete, relevant examples to support their explanation? Are examples novel (not just repeating the build content) and well-chosen?",
      weight: 20,
    },
    {
      name: "Depth progression",
      description:
        "Does the learner's understanding visibly deepen across teach-back rounds? Do they refine their explanation in response to harder challenges, or stay flat?",
      weight: 25,
    },
  ],
  passThreshold: 70,
  scoringGuidance:
    "Reason through each dimension separately before computing a weighted score. A learner who agrees with every objection without defending has scored 0 on defense quality regardless of other dimensions. A learner who restates the build content verbatim without adapting to challenges scores low on depth progression.",
};

export const ghostRubric: RubricBlock = {
  dimensions: [
    {
      name: "Gap addressing",
      description:
        "Does the response demonstrate the specific reasoning skill the learner previously failed at? Is the original gap visibly overcome, or is it still present in a new form?",
      weight: 60,
    },
    {
      name: "Transfer quality",
      description:
        "Does the learner apply the principle structurally to the new domain, or just swap surface-level nouns while using the same shallow reasoning?",
      weight: 40,
    },
  ],
  passThreshold: 65,
  scoringGuidance:
    "The only question that matters: is the original reasoning gap still visible? If the learner demonstrates the missing skill in the new domain — even imperfectly — that is meaningful progress. Do not evaluate domain expertise, writing quality, or comprehensiveness. Score purely on whether the gap has been addressed.",
};
