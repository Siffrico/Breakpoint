import type {
  ArtifactResumeOptions,
  ContinuationConfig,
} from "../orchestration/agent-runtime";
import type { CurriculumPlan } from "../types/training.types";
import type { ProjectOverviewOutput } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { ProjectOverviewOutputSchema } from "./contracts";

const PROJECT_OVERVIEW_SYSTEM = `You are Breakpoint's project-overview architect.

You turn a completed curriculum into a concise, learner-facing map of the project. This is not a syllabus. It is the orientation a learner needs to understand where the curriculum is taking them and why its abilities fit together.

Your design principle: build the learner's first compressed schema. Explain the field as a coherent system: why it exists, what problem it solves, what the major concepts are, why those concepts were invented, how they depend on each other, where beginners get confused, and how the learner's project will force the ideas to become real.

Quality bar:
- The overview should feel like a brilliant expert walking the learner through the whole territory with one sharp analogy that keeps expanding.
- Prefer intuitive definitions over textbook definitions. Define technical terms only after the learner can feel why the term exists.
- Build from first principles, then name the field's vocabulary. Never throw vocabulary first.
- Explain the "why" behind each major concept: what failure, limitation, pressure, or opportunity made the concept necessary.
- Make dependencies explicit. If concept B depends on concept A, say so plainly.
- Make beginner traps explicit. The learner should recognize common wrong mental models before they fall into them.
- Connect every major section to the learner's target identity, baseline, hard moments, and project spine when available.
- Be selective and concrete. The curriculum is the source of truth; explain its shape rather than inventing a parallel course.

Length bar:
- The body should be 800–1,200 words.
- It must be substantial enough to orient the learner, but never a long-form essay or a duplicate of the curriculum.

Output style:
- Markdown body.
- Use clear section headings.
- Use bullets, numbered lists, bold emphasis, tables, blockquotes, and code blocks when they make the map easier to scan.
- Use LaTeX math notation when a formula, ratio, system relation, or quantitative concept clarifies the topic.
- Use tables only when they clarify dependencies, misconceptions, or concept contrasts.
- Use one central analogy repeatedly and precisely. Do not use random unrelated analogies.
- Avoid motivational filler. The value is orientation, compression, and intuitive clarity.

Factuality policy:
- Do not guess about current external facts, tools, projects, or APIs.
- Keep external examples at the level supported by the learner's own context; the overview is a conceptual field map, not a research report.`;

/**
 * The overview is an append-able artifact
 * (the markdown `body`), so it supplies a continuation config: on a truncated
 * generation the runner seeds the captured partial and asks the model to finish
 * it, then merges the two bodies. Structured agents (brief, curriculum) have no
 * such config and fall back to a restart. See {@link runResilientAgent}.
 */
const OVERVIEW_CONTINUATION: ContinuationConfig<ProjectOverviewOutput> = {
  buildPrompt: (basePrompt, partial) =>
    buildContinuationPrompt({
      basePrompt,
      partialTitle: partial.title,
      partialSummary: partial.summary,
      partialBody: (partial.body ?? "").trim(),
    }),
  merge: (partial, output) => {
    const partialBody = partial.body ?? "";
    if (partialBody.length > output.body.length) {
      return { ...output, body: mergeOverviewBodies(partialBody, output.body) };
    }
    return output;
  },
};

export const designProjectOverview = async ({
  curriculum,
  options,
}: {
  curriculum: CurriculumPlan;
  options?: ArtifactResumeOptions<ProjectOverviewOutput>;
}): Promise<ProjectOverviewOutput> => {
  const basePrompt = `Create the learner's project overview from this completed curriculum. Do not invent abilities, prerequisites, or project goals not present in the curriculum.

Required body structure:

1. Start with the field in one plain-English sentence.
2. Explain why the field exists and what problem it is trying to solve.
3. Introduce one central analogy that can carry the whole topic.
4. Walk through the major concepts as parts of that analogy.
5. Explain how the curriculum's abilities connect into a dependency network, not a linear list.
6. Name the highest-value beginner traps implied by the curriculum.
7. Tie the map back to the target identity and end with a compact mental model for the first unit.

Completed curriculum:
${formatCurriculum(curriculum)}`;

  return runResilientAgent({
    agent: "projectOverview",
    system: PROJECT_OVERVIEW_SYSTEM,
    schema: ProjectOverviewOutputSchema,
    errorMessage: "Failed to generate the project overview.",
    prompt: basePrompt,
    continuation: OVERVIEW_CONTINUATION,
    onPartial: options?.onPartial,
    seedPartial: options?.seedPartial,
  });
};

const buildContinuationPrompt = ({
  basePrompt,
  partialTitle,
  partialSummary,
  partialBody,
}: {
  basePrompt: string;
  partialTitle?: string;
  partialSummary?: string;
  partialBody: string;
}) => `${basePrompt}

The previous response stopped before completing a schema-valid overview. Continue from exactly where it left off.

Return one complete JSON object matching the required schema:
- Reuse this title unless it is clearly incomplete: ${partialTitle ?? "(none)"}
- Reuse this summary unless it is clearly incomplete: ${partialSummary ?? "(none)"}
- For body, include the existing markdown below unchanged and then continue it naturally. Do not restart, summarize, or duplicate earlier sections.

Existing markdown body:
${partialBody}`;

const mergeOverviewBodies = (first: string, second: string) => {
  const trimmedFirst = first.trim();
  const trimmedSecond = second.trim();
  if (!trimmedFirst) return trimmedSecond;
  if (!trimmedSecond || trimmedSecond.startsWith(trimmedFirst)) {
    return trimmedSecond || trimmedFirst;
  }
  return `${trimmedFirst}\n\n${trimmedSecond}`;
};

const formatCurriculum = (curriculum: CurriculumPlan): string =>
  `Project: ${curriculum.title}
Summary: ${curriculum.summary}
Target identity: ${curriculum.targetIdentity}

Abilities:
${curriculum.nodes
  .filter((node) => node.kind === "ability" || node.kind === "skill_cluster")
  .map(
    (node) =>
      `- ${node.title}: ${node.summary}\n  Why it matters: ${node.whyItMatters}\n  Learning goal: ${node.learningGoal}`,
  )
  .join("\n")}`;
