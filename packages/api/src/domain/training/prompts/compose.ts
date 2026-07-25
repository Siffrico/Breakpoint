import type {
  ComposedPrompt,
  FewShotExample,
  PersonaBlock,
  PromptContext,
  PromptTemplate,
  RubricBlock,
} from "./types";

const renderPersona = (persona: PersonaBlock): string => {
  const lines = [persona.role, ""];

  if (persona.expertise.length > 0) {
    lines.push("Expertise:");
    persona.expertise.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }

  if (persona.constraints.length > 0) {
    lines.push("Constraints:");
    persona.constraints.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  lines.push(persona.outputExpectation);
  return lines.join("\n");
};

const renderRubric = (rubric: RubricBlock): string => {
  const lines = ["Evaluation rubric:", ""];

  rubric.dimensions.forEach((dim) => {
    lines.push(`- ${dim.name} (weight: ${dim.weight}): ${dim.description}`);
  });

  lines.push("");
  lines.push(`Pass threshold: ${rubric.passThreshold}/100`);
  lines.push("");
  lines.push(rubric.scoringGuidance);

  return lines.join("\n");
};

const renderExamples = (examples: FewShotExample[]): string => {
  const lines = ["Calibration examples:", ""];

  examples.forEach((ex) => {
    lines.push(
      `--- ${ex.label} (score: ${ex.score}, passed: ${ex.passed}) ---`,
    );
    lines.push(`Input: ${ex.input}`);
    lines.push(`Reasoning: ${ex.reasoning}`);
    lines.push("");
  });

  return lines.join("\n");
};

const renderAntiPatterns = (patterns: string[]): string => {
  const lines = ["Anti-patterns — never do any of these:"];
  patterns.forEach((p) => lines.push(`- ${p}`));
  return lines.join("\n");
};

/**
 * Composes a PromptTemplate + runtime context into final system/prompt strings.
 *
 * System prompt = persona + rubric (if present) + examples (if present) + anti-patterns
 * User prompt = instruction + context slots
 */
export const composePrompt = (
  template: PromptTemplate,
  context: PromptContext,
  options?: { isRetry?: boolean },
): ComposedPrompt => {
  // --- System prompt ---
  const systemParts = [renderPersona(template.persona)];

  if (template.rubric) {
    systemParts.push(renderRubric(template.rubric));
  }

  if (template.examples && template.examples.length > 0) {
    systemParts.push(renderExamples(template.examples));
  }

  if (template.antiPatterns && template.antiPatterns.length > 0) {
    systemParts.push(renderAntiPatterns(template.antiPatterns));
  }

  const system = systemParts.join("\n\n");

  // --- User prompt ---
  const promptParts = [template.instruction];

  const contextEntries = Object.entries(context).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );

  if (contextEntries.length > 0) {
    promptParts.push(
      contextEntries.map(([key, value]) => `${key}:\n${value}`).join("\n\n"),
    );
  }

  if (options?.isRetry && template.retryInstructions) {
    promptParts.push(`Retry instructions:\n${template.retryInstructions}`);
  }

  const prompt = promptParts.join("\n\n");

  return { system, prompt };
};
