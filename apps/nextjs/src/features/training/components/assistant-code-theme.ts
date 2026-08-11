// Sourced from @streamdown/code rather than shiki directly — shiki is that
// package's dependency, not ours, so it isn't resolvable from this app.
import type { ThemeInput } from "@streamdown/code";

/* Syntax theme for assistant code fences.
 *
 * Every color is a CSS variable rather than a hex value. Shiki writes token
 * colors straight through into the style attribute, so `var(--bp-code-string)`
 * survives into the DOM and resolves against whatever theme block is in scope.
 * That matters here: the workspace flips light/dark via `data-workspace-theme`,
 * NOT Tailwind's `.dark` class, and Streamdown's dual-theme output keys its
 * second palette off `.dark`. A real [light, dark] pair would therefore paint
 * dark syntax colors onto a light workspace.
 *
 * So both slots get the same var-based palette — the `.dark` swap becomes a
 * no-op and the actual flip happens in CSS, where `data-workspace-theme` can
 * reach it. The two registrations differ only in name because Shiki keys its
 * theme registry by name. */
const settings = [
  { settings: { foreground: "var(--bp-code-fg)" } },
  {
    scope: ["comment", "punctuation.definition.comment"],
    settings: { foreground: "var(--bp-code-comment)", fontStyle: "italic" },
  },
  {
    scope: [
      "string",
      "string.quoted",
      "punctuation.definition.string",
      "constant.other.symbol",
    ],
    settings: { foreground: "var(--bp-code-string)" },
  },
  {
    scope: [
      "keyword",
      "keyword.control",
      "storage",
      "storage.type",
      "storage.modifier",
      "variable.language",
      "keyword.operator.new",
    ],
    settings: { foreground: "var(--bp-code-keyword)" },
  },
  {
    scope: ["punctuation", "keyword.operator", "meta.brace"],
    settings: { foreground: "var(--bp-code-punct)" },
  },
  {
    scope: [
      "constant.numeric",
      "constant.language",
      "constant.character.escape",
    ],
    settings: { foreground: "var(--bp-code-number)" },
  },
  {
    scope: [
      "entity.name.function",
      "support.function",
      "meta.function-call",
      "entity.other.attribute-name",
    ],
    settings: { foreground: "var(--bp-code-fn)" },
  },
  {
    scope: [
      "entity.name.type",
      "entity.name.class",
      "entity.name.tag",
      "support.type",
      "support.class",
      "entity.other.inherited-class",
    ],
    settings: { foreground: "var(--bp-code-type)" },
  },
  {
    scope: ["variable", "support.variable", "meta.object-literal.key"],
    settings: { foreground: "var(--bp-code-fg)" },
  },
];

const colors = {
  "editor.background": "var(--bp-code-bg)",
  "editor.foreground": "var(--bp-code-fg)",
};

export const assistantCodeThemes: [ThemeInput, ThemeInput] = [
  { name: "bp-code-a", type: "light", colors, settings },
  { name: "bp-code-b", type: "dark", colors, settings },
];
