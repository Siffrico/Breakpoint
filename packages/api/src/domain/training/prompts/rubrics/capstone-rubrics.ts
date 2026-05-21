import type { RubricBlock } from "../types";

export const buildCapstoneRubric: RubricBlock = {
  dimensions: [
    {
      name: "Skill integration",
      description:
        "Does the artifact demonstrate synthesis of multiple cluster skills working together, or does it only apply one skill in isolation?",
      weight: 35,
    },
    {
      name: "Criteria satisfaction",
      description:
        "Does the artifact meet the stated evaluation criteria and constraints? Are any criteria unaddressed or superficially addressed?",
      weight: 35,
    },
    {
      name: "Depth and rigor",
      description:
        "Does the artifact show genuine understanding or surface-level assembly? Would an expert in the domain consider this competent work?",
      weight: 30,
    },
  ],
  passThreshold: 70,
  scoringGuidance:
    "Evaluate each criterion separately. A polished artifact that only applies one skill has not met the capstone bar regardless of quality. Feedback must be revision-actionable: if the learner didn't pass, they should know exactly what to change.",
};

export const debateCapstoneRubric: RubricBlock = {
  dimensions: [
    {
      name: "Concept application",
      description:
        "Does the learner defend using the cluster's specific principles and concepts, or generic argumentation and rhetoric?",
      weight: 40,
    },
    {
      name: "Consistency under pressure",
      description:
        "Does the learner maintain their position across all rounds, or do they fold or contradict themselves as challenges escalate?",
      weight: 35,
    },
    {
      name: "Judgment quality",
      description:
        "Does the learner demonstrate genuine judgment — acknowledging valid points while defending the core position — or do they either rigidly ignore objections or concede too easily?",
      weight: 25,
    },
  ],
  passThreshold: 70,
  scoringGuidance:
    "Generic rhetoric that could apply to any debate is not sufficient for a pass. The learner must demonstrate that they are using the cluster's principles as their defensive foundation. A strong round 1 that collapses in round 3 indicates fragile understanding.",
};

export const teachCapstoneRubric: RubricBlock = {
  dimensions: [
    {
      name: "Accuracy",
      description:
        "Is the core concept explained correctly? Are there factual errors or significant omissions?",
      weight: 30,
    },
    {
      name: "Audience adaptation",
      description:
        "Does the explanation adapt to the specific audience's constraints and perspective, or could it be given to anyone?",
      weight: 40,
    },
    {
      name: "Pushback handling",
      description:
        "When the audience pushes back, does the learner maintain the core insight while adapting their explanation, or do they either rigidly repeat or abandon their position?",
      weight: 30,
    },
  ],
  passThreshold: 70,
  scoringGuidance:
    "A technically accurate explanation that ignores audience constraints has not met the capstone bar. Audience adaptation is weighted highest because teaching to a specific constrained audience is the core skill being tested.",
};
