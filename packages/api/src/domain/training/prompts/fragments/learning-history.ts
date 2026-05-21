export interface PriorLearningRecord {
  title: string;
  score: number;
  readiness: string;
  finalArticulation: string | null;
  growthDimensions: string[] | null;
  improvements: string[];
  failureTags: string[];
  nextStep: string;
}

export const formatLearningHistory = (
  records: PriorLearningRecord[],
): string => {
  if (records.length === 0) return "No completed unit history yet.";

  return records
    .map(
      (item, i) => `History ${i + 1}
Title: ${item.title}
Score: ${item.score}
Readiness: ${item.readiness}
Final articulation: ${item.finalArticulation ?? "None"}
Growth dimensions: ${item.growthDimensions?.join("; ") ?? "None"}
Improvements: ${item.improvements.join("; ") || "None"}
Failure tags: ${item.failureTags.join("; ") || "None"}
Next step: ${item.nextStep}`,
    )
    .join("\n\n");
};

export interface CapstoneClusterHistory {
  title: string;
  summary: string;
  score: number;
  readiness: string;
  growthDimensions: string[] | null;
  improvements: string[];
  failureTags: string[];
}

export const formatCapstoneHistory = (
  history: CapstoneClusterHistory[],
): string => {
  if (history.length === 0) return "No unit history available.";

  return history
    .map(
      (item, i) => `${i + 1}. ${item.title}
- Summary: ${item.summary}
- Score: ${item.score}
- Readiness: ${item.readiness}
- Growth dimensions: ${item.growthDimensions?.join(", ") || "None captured"}
- Improvements: ${item.improvements.join("; ") || "None captured"}
- Failure tags: ${item.failureTags.join("; ") || "None captured"}`,
    )
    .join("\n");
};
