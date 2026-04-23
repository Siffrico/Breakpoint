import type { Memory } from "../../memory/types";
import { BREAKPOINT_TUTOR_PROMPT } from "./tutor-prompt";
import { getUserProfileMemory } from "./tutor-memory";
import {
  CurriculumStageSchema,
  type CurriculumStage,
  type TutorContext,
  type TutorStage,
} from "./schemas";

const formatList = (items: string[]) =>
  items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None yet";

export const formatTutorContextPrompt = ({
  memory,
  curriculumStage,
  latestLearnerMessage,
}: Pick<TutorContext, "memory" | "curriculumStage"> & {
  latestLearnerMessage?: string;
}) => `## User Profile Memory
Target identity: ${memory.targetIdentity ?? "Unknown"}
Current learning goal: ${memory.currentLearningGoal ?? "Unknown"}

Known strengths:
${formatList(memory.knownStrengths)}

Recurring failure patterns:
${formatList(memory.recurringFailurePatterns)}

Teaching preferences:
${formatList(memory.teachingPreferences)}

Preferred examples:
${formatList(memory.preferredExamples)}

Recent unit summaries:
${formatList(memory.recentUnitSummaries)}

## Current Curriculum Stage
Unit: ${curriculumStage.unitPosition ? `${curriculumStage.unitPosition.index}/${curriculumStage.unitPosition.total}: ` : ""}${curriculumStage.unitTitle}
Cluster: ${curriculumStage.clusterTitle ?? "None"}
Summary: ${curriculumStage.unitSummary}
Use goal: ${curriculumStage.learningGoal}
Active stage: ${curriculumStage.activeStage}
Retry count: ${curriculumStage.retryCount}

## Latest Learner Message
${latestLearnerMessage?.trim() || "None"}`;

export const buildTutorContext = async ({
  stage,
  curriculumStage,
  latestLearnerMessage,
  deps,
}: {
  userId: string;
  sessionId: string;
  stage: TutorStage;
  curriculumStage: CurriculumStage;
  latestLearnerMessage?: string;
  deps: {
    listMemories: () => Promise<Memory[]>;
  };
}): Promise<TutorContext> => {
  const parsedStage = CurriculumStageSchema.parse(curriculumStage);
  const memories = await deps.listMemories();
  const memory = getUserProfileMemory(memories);
  const context = {
    systemPrompt: BREAKPOINT_TUTOR_PROMPT,
    userPrompt: formatTutorContextPrompt({
      memory,
      curriculumStage: parsedStage,
      latestLearnerMessage,
    }),
    memory,
    stage,
    curriculumStage: parsedStage,
  };

  return context;
};
