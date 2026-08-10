export interface FrontierItem {
  id: string;
  questionId: string;
  question: string;
  questionOrderIndex: number;
  kind: "concept" | "mechanism";
  label: string;
  content: string;
  status: string;
  orderIndex: number;
  practiceCount: number;
}

export interface PracticeSkillSelection {
  skillId: string;
  skillName: string;
  practiceCount: number;
  targets: FrontierItem[];
}

export const selectNextPracticeSkill = (
  entries: readonly FrontierItem[],
  complexityBudget: 1 | 2 | 3,
): PracticeSkillSelection | null => {
  const entriesBySkill = new Map<string, FrontierItem[]>();
  for (const entry of entries) {
    const skillEntries = entriesBySkill.get(entry.questionId) ?? [];
    skillEntries.push(entry);
    entriesBySkill.set(entry.questionId, skillEntries);
  }

  const selectedSkill = [...entriesBySkill.values()].sort((left, right) => {
    const leftSkill = left[0];
    const rightSkill = right[0];
    if (!leftSkill || !rightSkill) return 0;
    return (
      leftSkill.practiceCount - rightSkill.practiceCount ||
      leftSkill.questionOrderIndex - rightSkill.questionOrderIndex
    );
  })[0];
  const skill = selectedSkill?.[0];
  if (!selectedSkill || !skill) return null;

  const unchecked = selectedSkill.filter(
    (entry) => entry.status === "unchecked",
  );
  const targetPool = unchecked.length > 0 ? unchecked : selectedSkill;
  const targets = [...targetPool]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .slice(0, complexityBudget);

  return {
    skillId: skill.questionId,
    skillName: skill.question,
    practiceCount: skill.practiceCount,
    targets,
  };
};
