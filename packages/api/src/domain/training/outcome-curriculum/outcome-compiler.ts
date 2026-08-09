import type { ArtifactResumeOptions } from "../orchestration/agent-runtime";
import type { OutcomeCompilationOutput } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { OutcomeCompilationOutputSchema } from "./contracts";

const OUTCOME_COMPILER_SYSTEM = `You compile one confirmed learning outcome into exactly two connected artifacts: a Skill Map and a Practice Contract.

The outcome title and result are fixed. Do not rename, broaden, split, or reinterpret them.

Before generating, decide which sources would provide the strongest evidence for this specific outcome. Search those sources thoroughly, cross-check important claims, and avoid relying on convenient but weak or biased sources. Then build both artifacts from that evidence.

Use the language that competent people in this exact domain use. For an exam or formal standard, preserve its established terminology, notation, task formats, and scoring language. For a profession or craft, use the concrete words practitioners use while doing the work. Do not invent labels to make the map sound educational. Avoid generic AI rhetoric, motivational prose, metaphors, and contrast templates such as “it is not X, it is Y.” State the useful fact, judgment, or action directly.

SKILL MAP — everything that materially changes performance on the fixed result.
- skills are the smallest useful capabilities that repeatedly matter in real tasks
- items contain the concepts and executable mechanisms needed for each skill
- expertJudgment contains decisions that distinguish strong from weak work
- commonMistakes contains realistic failure modes, why they happen, and how to notice them
- use one clear home for each idea; do not repeat the same knowledge in several sections

PRACTICE CONTRACT — how the outcome is practised and evaluated.
- workflow is the real solve path for one task
- taskTypes are whole tasks that preserve the fixed result while varying realistic situations; each lists the exact Skill Map names it exercises
- every task must make the learner do the important thinking; setup and production work that do not reveal understanding should be supplied
- qualityBar and evaluationCriteria must be observable in the learner's output or reasoning; each evaluation criterion lists the exact Skill Map names it measures
- variationAxes describe legitimate differences between tasks, not topic headings
- difficulty bands keep the result fixed and increase reasoning, uncertainty, and plausible traps rather than length or obscure facts
- neverDo lists ways a generated task could look plausible while failing to measure the result

Before returning, check that every Skill Map skill matters in at least one task type and can affect at least one evaluation criterion. Remove anything that does not change performance. Check that a generator could build a complete domain-authentic task from the Practice Contract without inventing its format.`;

export interface CompileOutcomeInput {
  targetIdentity: string;
  projectTitle: string;
  projectSummary: string;
  outcomeTitle: string;
  outcomeResult: string;
  learnerContext: {
    currentGap: string;
    goodMeans: string[];
  };
  priorPerformance?: readonly {
    title: string;
    score: number;
    failureTags: string[];
  }[];
  options?: ArtifactResumeOptions<OutcomeCompilationOutput>;
}

export const compileOutcome = async (
  input: CompileOutcomeInput,
): Promise<OutcomeCompilationOutput> =>
  runResilientAgent({
    agent: "curriculumDesigner",
    system: OUTCOME_COMPILER_SYSTEM,
    schema: OutcomeCompilationOutputSchema,
    errorMessage: "Failed to compile the outcome curriculum.",
    onPartial: input.options?.onPartial,
    seedPartial: input.options?.seedPartial,
    abortSignal: input.options?.abortSignal,
    prompt: `Compile this confirmed outcome.

Target identity: ${input.targetIdentity}
Project: ${input.projectTitle}
Project goal: ${input.projectSummary}
Outcome: ${input.outcomeTitle}
Fixed result: ${input.outcomeResult}
Current gap: ${input.learnerContext.currentGap}
Good work means: ${input.learnerContext.goodMeans.join(", ")}

${formatPriorPerformance(input.priorPerformance)}`,
  });

const formatPriorPerformance = (
  records: CompileOutcomeInput["priorPerformance"],
): string =>
  !records || records.length === 0
    ? "No earlier outcome performance exists yet."
    : `Recent performance:\n${records
        .map(
          (record) =>
            `- ${record.title}: ${record.score}${
              record.failureTags.length > 0
                ? `; failures: ${record.failureTags.join(", ")}`
                : ""
            }`,
        )
        .join("\n")}`;
