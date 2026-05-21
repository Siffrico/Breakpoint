/**
 * Core types for the Breakpoint prompt engine.
 *
 * Every AI call flows through a PromptTemplate that declares its persona,
 * instruction, rubric, examples, and model tier. This makes prompts
 * reviewable, diffable, and independently testable.
 */

/** Model tier determines which model handles the call. */
export type ModelTier = "critical" | "standard";

/** A structured persona block replaces one-liner system prompts. */
export interface PersonaBlock {
  /** One-sentence role statement. */
  role: string;
  /** Domain expertise the model should embody (2-5 bullets). */
  expertise: string[];
  /** Hard constraints on behavior (2-6 bullets). */
  constraints: string[];
  /** What the output should achieve — written as a success criterion. */
  outputExpectation: string;
}

/** A rubric dimension used for CoT-before-scoring evaluation prompts. */
export interface RubricDimension {
  name: string;
  description: string;
  weight: number;
}

/** A rubric block attached to evaluation/grading prompts. */
export interface RubricBlock {
  dimensions: RubricDimension[];
  passThreshold: number;
  /** Additional evaluation instructions appended after dimensions. */
  scoringGuidance: string;
}

/** A few-shot calibration example for grading prompts. */
export interface FewShotExample {
  label: string;
  input: string;
  reasoning: string;
  score: number;
  passed: boolean;
}

/** The full prompt template — the unit of prompt engineering. */
export interface PromptTemplate {
  /** Unique identifier, e.g. "grade-teachback". */
  id: string;
  /** Monotonically increasing version number. */
  version: number;
  /** Controls model routing via model-router. */
  tier: ModelTier;
  /** Rich system prompt. */
  persona: PersonaBlock;
  /** Task-specific instruction block (the "rules" section). */
  instruction: string;
  /** Evaluation rubric — only for grading/evaluation prompts. */
  rubric?: RubricBlock;
  /** Few-shot calibration examples — only for grading/evaluation prompts. */
  examples?: FewShotExample[];
  /** Shared anti-pattern constraints appended to all prompts of this type. */
  antiPatterns?: string[];
  /** Retry-specific instructions appended on attempt > 0. */
  retryInstructions?: string;
}

/** Context slots filled at call time by compose.ts. */
export interface PromptContext {
  [key: string]: string | undefined;
}

/** Result of composing a template + context into final strings. */
export interface ComposedPrompt {
  system: string;
  prompt: string;
}
