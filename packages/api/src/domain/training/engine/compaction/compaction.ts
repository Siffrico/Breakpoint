import type { CompactionPolicy } from "./policy";
import { DEFAULT_COMPACTION_POLICY } from "./policy";

/**
 * Per-unit transcript bounding. Pure — no AI SDK, no DB, no HTTP.
 *
 * Each education unit is now its own chat: a turn's model context is scoped to
 * the active unit, and a unit's turn count is bounded by the FSM (grill/repair
 * budgets over two passes). So there is no cross-unit growth to summarise away
 * — the only remaining risk is one pathologically long single message, which
 * this file guards without ever calling a model.
 */

/** Minimum shape bounding needs: only the rendered text matters. */
export interface BoundableMessage {
  content: string;
}

/** Middle-truncate one verbatim message so a single huge turn can't dominate. */
const clampMessage = <T extends BoundableMessage>(
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
 * Bound a single unit's transcript for a model call: middle-truncate any one
 * oversized message, then drop whole oldest messages if the total still blows
 * the char budget. A safety net against a marathon answer, not a summariser —
 * cross-unit memory is carried structurally (ratings, knowledge, recall).
 */
export const boundTranscript = <T extends BoundableMessage>(
  messages: T[],
  policy: CompactionPolicy = DEFAULT_COMPACTION_POLICY,
): T[] => {
  const budget = policy.maxVerbatimTotalChars;
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
