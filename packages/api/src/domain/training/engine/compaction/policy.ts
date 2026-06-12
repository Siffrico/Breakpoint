/**
 * Compaction policy — the ONE file you edit to retune how a project chat is
 * condensed as it grows across units.
 *
 * The model: one chat lives for the whole project. Its transcript is a stream
 * of units. We keep the most recent `keepRecentUnits` verbatim and fold every
 * older unit into a single rolling "progress" summary that is merged forward
 * (anchored) each time a unit ages out. Token limits are only an emergency
 * backstop — units, not tokens, are the primary compaction boundary.
 *
 * Nothing here knows about the AI SDK, the database, or HTTP. Change a number,
 * change behaviour. Add a knob here, read it in the pure functions in
 * `compaction.ts`.
 */
export interface CompactionPolicy {
  /**
   * How many of the most recent units stay verbatim in the prompt. Everything
   * older is represented only by the rolling summary. Bump this if you want the
   * model to "remember" more recent units word-for-word.
   */
  readonly keepRecentUnits: number;

  /**
   * Soft cap (characters) on a single recent message kept verbatim. Longer
   * messages are middle-truncated so one giant turn can't dominate the window.
   * Set to `Infinity` to disable.
   */
  readonly maxVerbatimMessageChars: number;

  /**
   * Emergency backstop only: if the summary + verbatim recent units still
   * exceed this character budget (rare — would mean a few units are enormous),
   * the oldest recent messages are dropped until it fits. This is a safety net,
   * not the normal path; tune `keepRecentUnits` first.
   */
  readonly maxVerbatimTotalChars: number;
}

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  keepRecentUnits: 3,
  maxVerbatimMessageChars: 6_000,
  maxVerbatimTotalChars: 80_000,
};
