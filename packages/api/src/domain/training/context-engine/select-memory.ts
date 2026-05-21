import type { Memory } from "../../memory/types";
import type { CurriculumNode, UnitContent } from "../types/training.types";
import {
  compactText,
  uniqueCompact,
  WORKSPACE_CONTEXT_BUDGET,
} from "./context-budget";

const PROFILE_PREFIX = "Breakpoint profile memory:";
const UNIT_PREFIX = "Breakpoint unit memory:";

const KEYWORD_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "being",
  "from",
  "have",
  "into",
  "that",
  "their",
  "there",
  "this",
  "with",
  "would",
  "your",
]);

export interface SelectedWorkspaceMemory {
  durableMemory: string[];
  recurringFailurePatterns: string[];
  preferences: string[];
}

export const selectWorkspaceMemory = ({
  memories,
  node,
  unit,
}: {
  memories: Memory[];
  node: CurriculumNode;
  unit: UnitContent;
}): SelectedWorkspaceMemory => {
  const profileMemory = memories
    .map((memory) => parseProfileMemory(memory.content))
    .find((memory): memory is ProfileMemory => memory != null);
  const rankedPlainMemories = rankMemories({
    memories: memories.filter(
      (memory) =>
        !memory.content.startsWith(PROFILE_PREFIX) &&
        !memory.content.startsWith(UNIT_PREFIX),
    ),
    query: [
      node.title,
      node.summary,
      node.learningGoal,
      unit.seedPrompt,
      ...unit.scenario.focusAreas,
    ].join(" "),
  });
  const recentUnitMemory = memories
    .filter((memory) => memory.content.startsWith(UNIT_PREFIX))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((memory) => memory.content.slice(UNIT_PREFIX.length).trim());

  return {
    durableMemory: uniqueCompact(
      [
        ...recentUnitMemory,
        ...(profileMemory?.recentUnitSummaries ?? []),
        ...rankedPlainMemories.map((memory) => memory.content),
      ],
      WORKSPACE_CONTEXT_BUDGET.durableMemory,
      WORKSPACE_CONTEXT_BUDGET.maxMemoryChars,
    ),
    recurringFailurePatterns: uniqueCompact(
      profileMemory?.recurringFailurePatterns ?? [],
      WORKSPACE_CONTEXT_BUDGET.recurringFailurePatterns,
      WORKSPACE_CONTEXT_BUDGET.maxMemoryChars,
    ),
    preferences: uniqueCompact(
      [
        ...(profileMemory?.teachingPreferences ?? []),
        ...(profileMemory?.preferredExamples ?? []),
      ],
      WORKSPACE_CONTEXT_BUDGET.preferences,
      WORKSPACE_CONTEXT_BUDGET.maxMemoryChars,
    ),
  };
};

interface ProfileMemory {
  recentUnitSummaries?: string[];
  recurringFailurePatterns?: string[];
  teachingPreferences?: string[];
  preferredExamples?: string[];
}

const parseProfileMemory = (content: string): ProfileMemory | null => {
  if (!content.startsWith(PROFILE_PREFIX)) return null;

  try {
    const parsed = JSON.parse(
      content.slice(PROFILE_PREFIX.length).trim(),
    ) as Partial<ProfileMemory> | null;
    if (!parsed || typeof parsed !== "object") return null;

    return {
      recentUnitSummaries: asStringArray(parsed.recentUnitSummaries),
      recurringFailurePatterns: asStringArray(parsed.recurringFailurePatterns),
      teachingPreferences: asStringArray(parsed.teachingPreferences),
      preferredExamples: asStringArray(parsed.preferredExamples),
    };
  } catch {
    return null;
  }
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const rankMemories = ({
  memories,
  query,
}: {
  memories: Memory[];
  query: string;
}): Memory[] => {
  const queryKeywords = extractKeywords(query);

  return memories
    .map((memory) => ({
      memory,
      score:
        overlapScore(extractKeywords(memory.content), queryKeywords) +
        sourceWeight(memory.source),
    }))
    .sort((left, right) => right.score - left.score)
    .map(({ memory }) => ({
      ...memory,
      content: compactText(
        memory.content,
        WORKSPACE_CONTEXT_BUDGET.maxMemoryChars,
      ),
    }));
};

const sourceWeight = (source: Memory["source"]): number => {
  if (source === "unit_report") return 3;
  if (source === "profile_update") return 2;
  return 0;
};

const extractKeywords = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((word) => !KEYWORD_STOPWORDS.has(word)) ?? [],
  );

const overlapScore = (left: Set<string>, right: Set<string>): number => {
  let score = 0;
  for (const word of left) {
    if (right.has(word)) score += 1;
  }
  return score;
};
