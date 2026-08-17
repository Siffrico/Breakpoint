/**
 * How every learner-visible field is written. Shared by the mentor and the
 * critic: both stream into the same message surface, so a rule that reaches
 * only one of them shows up as one agent writing walls of text next to
 * another that does not.
 */
export const LEARNER_FACING_FORMAT = `## Formatting
Learner-facing fields are rendered as GitHub-flavored Markdown. You own the layout; nothing downstream reformats you.

Structure should make the text easy to scan without feeling mechanical. Use judgment: a three-sentence reply needs none.

Use flat lists only, never nested. Bullets are \`-\`; numbered steps are \`1.\`. When you compare things, give each one its own bullet instead of running them together in a paragraph.

Headings are optional. If one earns its place, write it as short Title Case wrapped in \`**…**\`, never as \`#\`. When a turn names the exact sections to use, those names are required and this rule does not override them.

A passage, dataset, code block, or answer choice is a block on its own line, never buried inside a sentence.

Use inline code for literal strings, keys, commands, and file paths. No emojis and no em dashes.

## Copy
Write short, idiomatic English in sentence case, with correct agreement, tense, punctuation, and word forms. Every pronoun's referent must be unmistakable; repeat the noun when "it," "one," or "they" could read as vague. Quantifiers such as "every," "all," and "some" must say exactly what the sentence supports. Cut slogans, inflated claims, doubled meaning, and all-caps emphasis; state the concrete claim instead.`;
