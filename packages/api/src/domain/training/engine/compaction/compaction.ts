import type { CompactionPolicy } from "./policy";
import type { Summarizer } from "./summarize";
import { compactText } from "../../context-engine/context-budget";
import { DEFAULT_COMPACTION_POLICY } from "./policy";

/**
 * Pure compaction core. No AI SDK, no DB, no HTTP — just message-in,
 * message-out. The single side-effecting dependency (the LLM) is injected as a
 * {@link Summarizer}, so this whole file is unit-testable with a fake.
 */

export type CompactableRole = "user" | "assistant" | "system";

/**
 * Minimum shape compaction needs. Functions are generic over `T` so the
 * caller's richer message objects (with `sequence`, `slot`, etc.) pass through
 * untouched rather than being flattened into a lossy shape.
 */
export interface CompactableMessage {
  role: CompactableRole;
  content: string;
  /**
   * Monotonic transcript cursor. Used as the durable compaction anchor because
   * `unitId` may be null for legacy/pre-unit messages.
   */
  sequence?: number;
  /**
   * The unit this message belongs to. `null` means it predates this column or
   * belongs to pre-unit setup — contiguous nulls are treated as one legacy
   * bucket so old transcripts are not mistaken for one unit per message.
   */
  unitId: string | null;
}

export interface CompactionResult<T extends CompactableMessage> {
  /** Recent units, verbatim (possibly token-trimmed by the backstop). */
  messages: T[];
  /**
   * The updated rolling summary to persist. `null` means nothing has been
   * summarized yet. Persist this (with {@link coverage}) only when
   * {@link summaryChanged} is true.
   */
  summary: string | null;
  /**
   * The unitId of the newest unit folded into {@link summary} — the anchor
   * point. Persist alongside the summary so the next turn can tell whether a
   * new unit has aged out (and skip the LLM call when none has).
   */
  coverage: string | null;
  /** Sequence of the newest message folded into {@link summary}. */
  coverageSequence: number | null;
  /**
   * True when the summarizer actually ran this turn (a new unit aged out), so
   * the caller knows to persist. False means the stored summary still holds.
   */
  summaryChanged: boolean;
  /** True if a summary is in effect (older units were folded, now or earlier). */
  compacted: boolean;
}

interface UnitBucket<T extends CompactableMessage> {
  key: string;
  unitId: string | null;
  lastSequence: number | null;
  messages: T[];
}

/**
 * Group a flat, chronologically-ordered transcript into per-unit buckets,
 * preserving order. Messages are contiguous per unit in practice (sequence
 * order); grouping by first-seen unitId is robust either way.
 */
export const groupByUnit = <T extends CompactableMessage>(
  messages: T[],
): UnitBucket<T>[] => {
  const buckets: UnitBucket<T>[] = [];
  let current: UnitBucket<T> | undefined;

  for (const message of messages) {
    const key = message.unitId ?? "legacy:null-unit";
    if (current?.key !== key) {
      current = {
        key,
        unitId: message.unitId,
        lastSequence: message.sequence ?? null,
        messages: [],
      };
      buckets.push(current);
    }
    current.lastSequence = message.sequence ?? current.lastSequence;
    current.messages.push(message);
  }

  return buckets;
};

const formatTranscript = (messages: CompactableMessage[]): string =>
  messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

/** Middle-truncate one verbatim message so a single huge turn can't dominate. */
const clampMessage = <T extends CompactableMessage>(
  message: T,
  maxChars: number,
): T => {
  if (!Number.isFinite(maxChars) || message.content.length <= maxChars) {
    return message;
  }
  const half = Math.floor((maxChars - 1) / 2);
  const head = message.content.slice(0, half).trimEnd();
  const tail = message.content.slice(-half).trimStart();
  return { ...message, content: `${head}\n…\n${tail}` };
};

/**
 * Emergency backstop: if verbatim recent units still blow the char budget,
 * drop whole oldest recent messages until they fit. Normal tuning is
 * `keepRecentUnits`; this only fires on pathologically large units.
 */
const applyTokenBackstop = <T extends CompactableMessage>(
  messages: T[],
  summary: string | null,
  policy: CompactionPolicy,
): T[] => {
  const budget = policy.maxVerbatimTotalChars - (summary?.length ?? 0);
  let kept = messages.map((m) =>
    clampMessage(m, policy.maxVerbatimMessageChars),
  );

  let total = kept.reduce((sum, m) => sum + m.content.length, 0);
  while (total > budget && kept.length > 1) {
    const [dropped, ...rest] = kept;
    total -= dropped?.content.length ?? 0;
    kept = rest;
  }
  return kept;
};

/**
 * Condense a long-lived project transcript.
 *
 * Keeps the last `keepRecentUnits` units verbatim and folds older units into an
 * anchored rolling summary. The summarizer runs **only when a new unit has aged
 * out** since `previousCoverage` — on every other turn the stored summary is
 * reused with zero LLM cost. When it does run, only the newly-aged units are
 * fed in (merged into `previousSummary`), keeping the call small.
 *
 * On summarizer failure it degrades: it reuses `previousSummary` and keeps the
 * old coverage so the merge is retried next turn — it never re-sends the
 * oversized older units.
 */
export const compactTranscript = async <T extends CompactableMessage>({
  messages,
  previousSummary,
  previousCoverage = null,
  previousCoverageSequence = null,
  summarize,
  policy = DEFAULT_COMPACTION_POLICY,
}: {
  messages: T[];
  previousSummary: string | null;
  /** The `coverage` returned by the last compaction, loaded from storage. */
  previousCoverage?: string | null;
  /** The `coverageSequence` returned by the last compaction, loaded from storage. */
  previousCoverageSequence?: number | null;
  summarize: Summarizer;
  policy?: CompactionPolicy;
}): Promise<CompactionResult<T>> => {
  const units = groupByUnit(messages);

  // Nothing has aged out and no prior summary exists → pass through untouched.
  if (units.length <= policy.keepRecentUnits && !previousSummary) {
    return {
      messages,
      summary: null,
      coverage: null,
      coverageSequence: null,
      summaryChanged: false,
      compacted: false,
    };
  }

  const splitAt = Math.max(0, units.length - policy.keepRecentUnits);
  const olderUnits = units.slice(0, splitAt);
  const recentMessages = units.slice(splitAt).flatMap((unit) => unit.messages);

  // Units that have aged out but are not yet reflected in the stored summary.
  const coveredIndex =
    previousCoverageSequence != null
      ? units.findIndex((unit) => unit.lastSequence === previousCoverageSequence)
      : previousCoverage
        ? units.findIndex((unit) => unit.unitId === previousCoverage)
        : -1;
  const newlyAged = olderUnits.slice(coveredIndex + 1);

  let summary = previousSummary;
  let coverage = previousCoverage;
  let coverageSequence = previousCoverageSequence;
  let summaryChanged = false;

  if (newlyAged.length > 0) {
    const newlyAgedMessages = newlyAged.flatMap((unit) => unit.messages);
    try {
      summary = await summarize({
        previousSummary,
        transcript: formatTranscript(newlyAgedMessages),
      });
      const newestCovered = olderUnits[olderUnits.length - 1];
      coverage = newestCovered?.unitId ?? previousCoverage;
      coverageSequence = newestCovered?.lastSequence ?? previousCoverageSequence;
      summaryChanged = true;
    } catch {
      // Keep the (possibly stale) prior summary and coverage; the merge retries
      // next turn. If we had no prior summary, leave a terse marker so the model
      // knows earlier context was dropped — persist it so we stop retrying.
      if (!previousSummary) {
        summary = compactText(
          "Earlier units in this project were dropped from context and could not be summarized.",
          policy.maxVerbatimMessageChars,
        );
        const newestCovered = olderUnits[olderUnits.length - 1];
        coverage = newestCovered?.unitId ?? previousCoverage;
        coverageSequence =
          newestCovered?.lastSequence ?? previousCoverageSequence;
        summaryChanged = true;
      }
    }
  }

  return {
    messages: applyTokenBackstop(recentMessages, summary, policy),
    summary,
    coverage,
    coverageSequence,
    summaryChanged,
    compacted: Boolean(summary),
  };
};

/**
 * Render the rolling summary as a system-prompt block. Append the return value
 * to your base system prompt. Returns "" when there is no summary.
 */
export const renderProgressBlock = (summary: string | null): string => {
  if (!summary) return "";
  return `\n\n<progress-so-far>\nMemory of earlier units in this project (recent units follow verbatim):\n\n${summary}\n</progress-so-far>`;
};
