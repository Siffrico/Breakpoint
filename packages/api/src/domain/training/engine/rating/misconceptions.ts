/**
 * Misconception ledger — pure reducer over the per-(learner, job) list of
 * misconception states. Misconceptions are first-class objects with a
 * lifecycle, not strings in a transcript:
 *
 *   active ──(targeted by a repair scenario + clean pass)──► addressed
 *   addressed ──(clean pass on a second targeted scenario)──► resolved
 *   addressed/resolved ──(error code reappears)──► active (occurrences++)
 *   active ──(targeted scenario failed under a different code)──► refuted
 *
 * The two-step resolution is deliberate: one good answer after remediation is
 * evidence, two is a pattern.
 *
 * `refuted` is the case the ledger used to have no answer for. A scenario
 * built to break one idea, failed for an unrelated reason, is evidence that
 * the idea was never the learner's problem. Leaving it active makes it the
 * highest-occurrence entry and the system repairs it forever.
 */

export type MisconceptionStatus =
  | "active"
  | "addressed"
  | "resolved"
  | "refuted";

export interface MisconceptionState {
  /** Code from the closed error taxonomy. */
  readonly code: string;
  readonly status: MisconceptionStatus;
  /** How many attempts have exhibited this error. */
  readonly occurrences: number;
  readonly lastSeenAt: Date;
}

export interface MisconceptionEvidence {
  /** Error codes the evaluator attached to this attempt. */
  readonly errorCodes: readonly string[];
  /** The code the scenario was engineered to test, when intent was "repair". */
  readonly targetedCode?: string | null;
  /** Whether the attempt was a clean pass (see `assessAttempt`). */
  readonly cleanPass: boolean;
  readonly occurredAt: Date;
}

/**
 * Fold one attempt's evidence into the ledger. Takes the current states and
 * the attempt's error codes, produces the next states (new codes appended,
 * reappearing codes reactivated, targeted-and-beaten codes advanced toward
 * resolved). Never throws — unknown codes simply become new active entries.
 */
export const reduceMisconceptions = (
  current: readonly MisconceptionState[],
  evidence: MisconceptionEvidence,
): MisconceptionState[] => {
  const exhibited = new Set(evidence.errorCodes);
  const next = current.map((state): MisconceptionState => {
    if (exhibited.has(state.code)) {
      return {
        ...state,
        status: "active",
        occurrences: state.occurrences + 1,
        lastSeenAt: evidence.occurredAt,
      };
    }
    if (state.code !== evidence.targetedCode) return state;
    if (evidence.cleanPass) {
      return state.status === "resolved"
        ? state
        : {
            ...state,
            status: state.status === "active" ? "addressed" : "resolved",
            lastSeenAt: evidence.occurredAt,
          };
    }
    // The scenario was built to expose this code and the learner failed it for
    // some other reason. The guess was wrong, so stop targeting it.
    return {
      ...state,
      status: "refuted",
      lastSeenAt: evidence.occurredAt,
    };
  });

  const known = new Set(current.map((state) => state.code));
  for (const code of evidence.errorCodes) {
    if (!known.has(code)) {
      next.push({
        code,
        status: "active",
        occurrences: 1,
        lastSeenAt: evidence.occurredAt,
      });
    }
  }
  return next;
};

/**
 * The misconception a repair scenario should target next: the active one
 * with the most occurrences (ties broken by most recently seen). Null when
 * nothing is active — the ladder then moves on to difficulty optimisation.
 */
export const selectRepairTarget = (
  states: readonly MisconceptionState[],
): MisconceptionState | null => {
  let best: MisconceptionState | null = null;
  for (const state of states) {
    if (state.status !== "active") continue;
    if (
      best === null ||
      state.occurrences > best.occurrences ||
      (state.occurrences === best.occurrences &&
        state.lastSeenAt.getTime() > best.lastSeenAt.getTime())
    ) {
      best = state;
    }
  }
  return best;
};
