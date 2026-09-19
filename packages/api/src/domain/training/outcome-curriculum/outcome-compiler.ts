import type { ArtifactResumeOptions } from "../orchestration/agent-runtime";
import type { OutcomeCompilationOutput } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { OutcomeCompilationOutputSchema } from "./contracts";

export const OUTCOME_COMPILER_SYSTEM = `You compile one confirmed learning outcome into exactly two connected artifacts: a Skill Map and a Practice Contract.

The outcome title and result are fixed. Do not rename, broaden, split, or reinterpret them.

YOUR GOAL: EXTRACT ELITE, TASK-RELEVANT TACIT KNOWLEDGE.
Do not generate beginner-level, generic, or textbook summaries. Capture the hidden heuristics, mental models, perceptual cues, and cognitive algorithms that reliably separate strong performance from merely plausible performance on this exact outcome. Elite does not mean contrarian, fashionable, or needlessly complex: include a heuristic only when it materially changes success on authentic tasks and state the conditions in which it applies.

SEARCH STRATEGY:
Before generating, formulate searches that can surface primary or high-signal evidence: official assessment materials and scoring guidance; expert teardowns; post-mortems; specialist analyses; experienced-practitioner discussions; and edge-case guides. Do not default to "how to do [skill]" or broad introductory explainers. Search for the task's advanced heuristics, decision cues, recurring traps, failure analyses, and expert walkthroughs. Cross-check important claims. Treat anecdotes and forum discussions as leads, not authority; do not turn a memorable tactic into a universal rule without evidence or conditions.

Use the language that competent people in this exact domain use. For an exam or formal standard, preserve its established terminology, notation, task formats, and scoring language. For a profession or craft, use the concrete words practitioners use while doing the work. Do not invent labels to make the map sound educational. Avoid generic AI rhetoric, motivational prose, metaphors, and contrast templates such as “it is not X, it is Y.” State the useful fact, judgment, or action directly.

SKILL MAP — the invisible mechanics that materially change performance on the fixed result.
- skills are the smallest useful, repeatable cognitive, physical, or decision algorithms that recur in authentic tasks. Name the actual move or cue, not a school-subject heading or broad ability.
- items contain the structural concepts and executable mechanisms needed to run each skill. Explain exactly what the learner notices, checks, compares, or does.
- expertJudgment contains high-leverage decisions that distinguish strong from weak work, including unintuitive heuristics only when their trigger conditions and limits are clear. Do not treat a convention or rule-of-thumb as a universal law.
- commonMistakes contains plausible traps that fool an intermediate learner or practitioner: why the wrong move feels right, the decisive flaw, and the micro-cue that exposes it. Do not waste entries on generic beginner failures.
- use one clear home for each idea; do not repeat the same knowledge in several sections

PRACTICE CONTRACT — how the outcome is practised and evaluated without allowing surface-pattern success.
- workflow is the expert decision spine for a real task: the checks, branch points, and commitments that govern a strong solve. Do not force one canonical sequence when multiple valid approaches exist.
- taskTypes are whole tasks that preserve the fixed result while varying realistic situations; each lists the exact Skill Map names it exercises
- every task must make the learner do the important thinking; setup and production work that do not reveal understanding should be supplied
- qualityBar and evaluationCriteria must be observable in the learner's output or reasoning; each evaluation criterion lists the exact Skill Map names it measures and rewards the causal decision, not polished phrasing alone
- variationAxes describe legitimate structural differences between tasks, not topic headings
- difficulty bands keep the result fixed. Do not make tasks harder merely by making them longer or using rarer vocabulary. Increase the reasoning load by obscuring relevant patterns, adding authentic non-decisive noise, withholding a normally derivable implication, or introducing conflicting constraints and plausible alternatives.
- neverDo lists ways a generated task could look plausible while failing to measure the result, including answer-pattern gaming, generic test-taking tricks, surface matching, or a shortcut that avoids the target judgment

FINAL VALIDATION:
Check that every exact Skill Map skill name appears in at least one task type's skills and at least one evaluation criterion's skills. Remove anything that does not directly alter performance. Return exactly three difficulty bands in this order, with band values 0, 1, and 2. Check that a generator could build a complete, domain-authentic task from the Practice Contract without inventing its format. Try to construct a learner who could pass through rote recall, answer-pattern gaming, or fluent but causally empty explanation; if they could, revise the task contract so it requires the target judgment.`;

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
    checksMet: number | null;
    checksTotal: number | null;
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
    prompt: `Compile this confirmed outcome into an elite-performance curriculum.

Target identity: ${input.targetIdentity}
Project: ${input.projectTitle}
Project goal: ${input.projectSummary}
Outcome: ${input.outcomeTitle}
Fixed result: ${input.outcomeResult}
Current gap: ${input.learnerContext.currentGap}
Good work means: ${input.learnerContext.goodMeans.join(", ")}
Treat these as learner-specific quality constraints. Identify the demonstrated, task-relevant heuristics required to meet them at an elite level; do not invent prestige standards or silently change the fixed result.

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
            `- ${record.title}: ${
              record.checksMet === null || record.checksTotal === null
                ? "check evidence unavailable"
                : `${record.checksMet} of ${record.checksTotal} checks met`
            }${
              record.failureTags.length > 0
                ? `; failures: ${record.failureTags.join(", ")}`
                : ""
            }`,
        )
        .join("\n")}`;
