export const WORKSPACE_CONTEXT_BUDGET = {
  durableMemory: 6,
  recurringFailurePatterns: 4,
  preferences: 4,
  recentTranscriptMessages: 10,
  maxMemoryChars: 220,
  maxTranscriptChars: 500,
  maxEvidenceChars: 420,
} as const;

export const compactText = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
};

export const uniqueCompact = (
  values: string[],
  limit: number,
  maxChars: number,
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const compacted = compactText(value, maxChars);
    const key = compacted.toLowerCase();
    if (!compacted || seen.has(key)) continue;

    seen.add(key);
    result.push(compacted);
    if (result.length >= limit) break;
  }

  return result;
};
