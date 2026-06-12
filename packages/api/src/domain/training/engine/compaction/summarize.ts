import type { LanguageModel } from "ai";
import { generateText } from "ai";

/**
 * The only AI-coupled file in the compaction subsystem. Everything else is
 * pure. The orchestrator depends on the {@link Summarizer} interface, not on
 * this implementation, so it can be faked in tests.
 */
export interface SummarizeInput {
  /** The current rolling summary to update, or null on the first compaction. */
  previousSummary: string | null;
  /** Formatted transcript of the units that are aging out of the verbatim window. */
  transcript: string;
}

export type Summarizer = (input: SummarizeInput) => Promise<string>;

/**
 * Breakpoint-tailored persona. This is a *learner progress* summary, not a
 * generic conversation digest — it captures what we must keep knowing about
 * the learner to keep teaching them well. Edit this prompt (and the template
 * below) to change what a long-lived project chat "remembers."
 */
const SUMMARIZER_SYSTEM = `You maintain the long-term memory of a one-on-one learning project that spans many units.

You are given the older part of the conversation (recent units are kept verbatim elsewhere and are NOT your concern). Produce a tight, durable summary of what matters for continuing to teach this learner.

If a <previous-summary> block is present, treat it as the existing memory: keep still-true facts, drop anything now stale or superseded, and merge in new facts from the transcript. Do not simply append — integrate.

Rules:
- Follow the section structure in the user prompt exactly. Keep every heading even if a section is "None yet."
- Terse bullets, not paragraphs. Preserve concrete names: the project, units, tools, libraries, specific mistakes.
- Capture struggles and misconceptions — these are the highest-value memory for teaching.
- Do not continue the lesson, answer questions, or mention that you are summarizing. Respond in the conversation's language.`;

const SUMMARY_TEMPLATE = `Update the project memory using this exact structure:

## Learner & goal
- Who they are and what they're building toward.

## Skill signals
- Demonstrated level; what they clearly know vs. clearly don't.

## Units covered
- Per older unit: what was taught, what they built/decided, key takeaways.

## Struggles & misconceptions
- Mistakes, confusions, and gaps to revisit. Be specific.

## Preferences & constraints
- How they like to learn, time/tooling/environment constraints.

## Open threads
- Unresolved questions or promised follow-ups carried into recent units.`;

const SUMMARIZE_TIMEOUT_MS = 12_000;

export interface CreateSummarizerOptions {
  /** Upper bound on summary length. Keeps the rolling memory from drifting large. */
  maxOutputTokens?: number;
}

/**
 * Build a {@link Summarizer} backed by a concrete model. Throws on provider
 * failure/timeout — the orchestrator decides how to degrade (it reuses the
 * previous summary rather than crashing the chat).
 */
export const createSummarizer = (
  model: LanguageModel,
  { maxOutputTokens = 1_024 }: CreateSummarizerOptions = {},
): Summarizer => {
  return async ({ previousSummary, transcript }) => {
    const prompt = [
      previousSummary
        ? `<previous-summary>\n${previousSummary}\n</previous-summary>`
        : null,
      "<transcript-to-summarize>",
      transcript,
      "</transcript-to-summarize>",
      "",
      SUMMARY_TEMPLATE,
    ]
      .filter(Boolean)
      .join("\n");

    const { text } = await generateText({
      model,
      system: SUMMARIZER_SYSTEM,
      prompt,
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(SUMMARIZE_TIMEOUT_MS),
    });

    const trimmed = text.trim();
    if (!trimmed) throw new Error("Summarizer returned empty output.");
    return trimmed;
  };
};
