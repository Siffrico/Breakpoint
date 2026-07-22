export const buildMissionContext = ({
  goal,
  unitTitle,
  unitGoal,
  concepts,
}: {
  goal: string;
  unitTitle: string;
  unitGoal: string;
  concepts: string[];
}) =>
  `## Learner context\nGoal: ${goal}\nMastered unit: ${unitTitle}\nUnit objective: ${unitGoal}\nConcepts to carry into the world: ${concepts.length ? concepts.map((item) => `- ${item}`).join("\n") : "- Use the unit objective directly."}`;
