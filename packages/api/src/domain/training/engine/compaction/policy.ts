/**
 * Transcript-bounding policy — the ONE file you edit to retune how a single
 * unit's transcript is capped before it is handed to a model.
 *
 * Each unit is its own chat and cursor evidence survives outside the verbatim
 * window. These limits prevent a long adaptive loop or one oversized
 * answer from exhausting context. Change a number, change behaviour; the pure
 * functions in `compaction.ts` read these.
 */
export interface CompactionPolicy {
  /**
   * Soft cap (characters) on a single message kept verbatim. Longer messages
   * are middle-truncated so one giant turn can't dominate the window. Set to
   * `Infinity` to disable.
   */
  readonly maxVerbatimMessageChars: number;

  /**
   * Emergency backstop: if the bounded messages still exceed this character
   * budget, the oldest messages are dropped until they fit. Rare — would mean a
   * single unit ran unusually long.
   */
  readonly maxVerbatimTotalChars: number;
}

export const DEFAULT_COMPACTION_POLICY: CompactionPolicy = {
  maxVerbatimMessageChars: 6_000,
  maxVerbatimTotalChars: 80_000,
};
