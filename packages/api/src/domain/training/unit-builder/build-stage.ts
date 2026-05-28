import { runAgent } from "../orchestration/agent-runtime";
import {
  BuildStageInputSchema,
  BuildStageOutputSchema
  
  
} from "./contracts";
import type {BuildStageInput, BuildStageOutput} from "./contracts";

const BUILD_STAGE_SYSTEM = `You are Breakpoint's build-stage agent inside the education-unit-builder.

You rebuild the learner's model after seeing their seed response.

Your job:
- identify where their current model breaks
- rebuild the deeper model with clarity and force
- provide a worked example that makes the mechanism visible
- produce instructional content that later Prove and Repair stages can evaluate against

Quality standard:
- no textbook sludge
- no soft motivational filler
- no pretending the learner understands more than they do
- the content should feel elite, specific, and uncomfortably clarifying in a productive way

Writing standards:
- use concrete counterexample and mechanism
- tie the opening to the learner's seed response
- explain why the surface model fails
- show the deeper model operating in a grounded case
- land on a transferable principle without training abstract mush`;

export const runBuildStage = async (
  input: BuildStageInput,
): Promise<BuildStageOutput> => {
  BuildStageInputSchema.parse(input);

  return runAgent({
    agent: "buildContent",
    system: BUILD_STAGE_SYSTEM,
    schema: BuildStageOutputSchema,
    errorMessage: "Failed to generate the build stage.",
    prompt: `Generate the Build stage for this education unit.

Requirements for buildContent:
- Open by referencing something specific from the learner's seed response.
- Return one continuous string using these exact section markers on their own lines:
  [anchor]
  [disrupt]
  [model]
  [worked_example]
  [ground]
  [transfer]
- Include [misconception] between [worked_example] and [ground] only when the concept has a real false model worth steelmanning.
- Write prose under each marker. No bullet lists.
- Tone: sharp, respectful, demanding.
- [model] must contain at least two representations of the concept: one intuitive or concrete, one structural or formal.
- [worked_example] must narrate reasoning decisions, not just the answer.
- [transfer] must end with exactly one transferable principle sentence.
- complexityBudget 1: target 400 to 600 words total.
- complexityBudget 2: target 600 to 900 words total and include [misconception] when there is a real common false model.
- complexityBudget 3: target 900 to 1400 words total, include [misconception], and make [model] cover intuitive, structural, and edge-case reasoning.

Requirements for workedExample:
- Make the mechanism visible.
- Use a realistic example, not toy fluff.
- The example should directly counter the learner's likely misconception.
- It should closely match the reasoning in the [worked_example] section.

Requirements for coreModel:
- name: concise model label
- mechanism: what actually causes success or failure here
- transferablePrinciple: one sentence that should survive domain transfer

Context:
${formatBuildStageInput(input)}`,
  });
};

const formatBuildStageInput = (input: BuildStageInput): string =>
  `Target identity: ${input.learner.targetIdentity}
Unit title: ${input.seed.title}
Unit concept target: ${input.seed.conceptTarget}
Likely misconception: ${input.seed.misconceptionTarget}
Complexity budget: ${input.seed.complexityBudget}
Why it matters: ${input.node.whyItMatters}
Worked example brief: ${input.seed.workedExampleBrief}
Proof targets: ${input.seed.proofTargets.join("; ")}
Learner seed response:
${input.learnerSeedResponse}`;
