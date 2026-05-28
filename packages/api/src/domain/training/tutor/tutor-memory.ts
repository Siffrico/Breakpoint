import type { Memory } from "../../memory/types";
import type { PostUnitReport, UserProfileMemory } from "./schemas";

const PROFILE_PREFIX = "Breakpoint profile memory:";
const UNIT_PREFIX = "Breakpoint unit memory:";

const unique = (items: string[], limit: number) =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);

const parseProfileMemory = (content: string): Partial<UserProfileMemory> | null => {
  if (!content.startsWith(PROFILE_PREFIX)) return null;

  try {
    const parsed = JSON.parse(content.slice(PROFILE_PREFIX.length).trim()) as Partial<UserProfileMemory>;
    return typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const getUserProfileMemory = (memories: Memory[]): UserProfileMemory => {
  const profileMemory = memories
    .map((memory) => parseProfileMemory(memory.content))
    .find((memory): memory is Partial<UserProfileMemory> => memory != null);

  const unitSummaries = memories
    .filter((memory) => memory.content.startsWith(UNIT_PREFIX))
    .map((memory) => memory.content.slice(UNIT_PREFIX.length).trim());

  const plainMemories = memories
    .filter((memory) => !memory.content.startsWith(PROFILE_PREFIX) && !memory.content.startsWith(UNIT_PREFIX))
    .map((memory) => memory.content);

  return {
    targetIdentity: profileMemory?.targetIdentity ?? null,
    currentLearningGoal: profileMemory?.currentLearningGoal ?? null,
    knownStrengths: unique(profileMemory?.knownStrengths ?? [], 8),
    recurringFailurePatterns: unique(profileMemory?.recurringFailurePatterns ?? [], 8),
    teachingPreferences: unique(
      [...(profileMemory?.teachingPreferences ?? []), ...plainMemories.slice(0, 3)],
      8,
    ),
    preferredExamples: unique(profileMemory?.preferredExamples ?? [], 8),
    recentUnitSummaries: unique(
      [...unitSummaries, ...(profileMemory?.recentUnitSummaries ?? [])],
      8,
    ),
  };
};

export const serializeProfileMemory = (memory: UserProfileMemory) =>
  `${PROFILE_PREFIX} ${JSON.stringify(memory)}`;

export const serializeUnitSummaryMemory = (
  report: PostUnitReport["unitSummaryMemory"],
) =>
  `${UNIT_PREFIX} ${report.unitTitle} | concept=${report.conceptLearned} | evidence=${report.evidenceOfGrowth} | remainingGap=${report.remainingGap ?? "none"} | next=${report.nextBestStep}`;

export const mergePostUnitReportIntoMemory = ({
  current,
  report,
}: {
  current: UserProfileMemory;
  report: PostUnitReport;
}): UserProfileMemory => ({
  targetIdentity: report.profileMemoryPatch.targetIdentity ?? current.targetIdentity,
  currentLearningGoal:
    report.profileMemoryPatch.currentLearningGoal ?? current.currentLearningGoal,
  knownStrengths: unique(
    [...report.profileMemoryPatch.knownStrengths, ...current.knownStrengths],
    8,
  ),
  recurringFailurePatterns: unique(
    [
      ...report.profileMemoryPatch.recurringFailurePatterns,
      ...current.recurringFailurePatterns,
    ],
    8,
  ),
  teachingPreferences: unique(
    [...report.profileMemoryPatch.teachingPreferences, ...current.teachingPreferences],
    8,
  ),
  preferredExamples: unique(
    [...report.profileMemoryPatch.preferredExamples, ...current.preferredExamples],
    8,
  ),
  recentUnitSummaries: unique(
    [
      `${report.unitSummaryMemory.unitTitle}: ${report.unitSummaryMemory.conceptLearned}. ${report.unitSummaryMemory.nextBestStep}`,
      ...current.recentUnitSummaries,
    ],
    8,
  ),
});
