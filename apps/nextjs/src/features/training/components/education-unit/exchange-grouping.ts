/**
 * Pure grouping of a workspace transcript into "exchanges" — the unit of
 * collapse in the scenario workspace. Messages alternate assistant → user,
 * and each assistant turn carries both the feedback for the previous answer
 * and the next prompt, so an exchange is an (assistant prompt, user answer)
 * pair. The latest assistant turn is always the active prompt and never
 * collapses; everything before it pairs off into receipt history.
 *
 * No React or transport imports: callers map their message shapes into
 * `ExchangeMessage` and render the result however they like.
 */

export interface ExchangeMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  failed?: boolean;
}

export interface Exchange {
  /** Assistant turn that opened the exchange; null for an orphan answer. */
  prompt: ExchangeMessage | null;
  /** User answer to the prompt; null while unanswered. */
  answer: ExchangeMessage | null;
}

export interface LiveExchanges {
  /** Completed exchanges, oldest first — rendered as collapsed receipts. */
  history: Exchange[];
  /** Latest assistant turn — always rendered fully expanded. */
  activePrompt: ExchangeMessage | null;
  /** Answer to the active prompt, sent but not yet replied to. */
  pendingAnswer: ExchangeMessage | null;
  /**
   * Failed sends, regardless of position in the transcript. Pinned into the
   * active region so the retry affordance can never collapse into history.
   */
  failedAnswers: ExchangeMessage[];
}

/**
 * Pairs a complete transcript into exchanges: each assistant message opens
 * one, the next user message closes it. A leading user message (no prompt
 * yet) becomes an orphan exchange with a null prompt.
 */
export const toCompletedExchanges = (
  messages: readonly ExchangeMessage[],
): Exchange[] => {
  const exchanges: Exchange[] = [];

  for (const message of messages) {
    if (message.role === "assistant") {
      exchanges.push({ prompt: message, answer: null });
      continue;
    }

    const open = exchanges[exchanges.length - 1];
    if (open?.answer === null) {
      open.answer = message;
    } else {
      exchanges.push({ prompt: null, answer: message });
    }
  }

  return exchanges;
};

/**
 * Live view of a transcript: the final exchange stays expanded as the active
 * prompt (plus its pending answer, if the reply has not started), everything
 * earlier collapses into history.
 */
export const groupLiveExchanges = (
  messages: readonly ExchangeMessage[],
): LiveExchanges => {
  const failedAnswers = messages.filter(
    (message) => message.role === "user" && message.failed === true,
  );
  const settled = messages.filter(
    (message) => !(message.role === "user" && message.failed === true),
  );

  const exchanges = toCompletedExchanges(settled);
  const active = exchanges[exchanges.length - 1];

  if (!active) {
    return {
      history: [],
      activePrompt: null,
      pendingAnswer: null,
      failedAnswers,
    };
  }

  return {
    history: exchanges.slice(0, -1),
    activePrompt: active.prompt,
    pendingAnswer: active.answer,
    failedAnswers,
  };
};
