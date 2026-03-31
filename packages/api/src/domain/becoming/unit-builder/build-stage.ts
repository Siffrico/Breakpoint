import { runAgent } from "../orchestration/agent-runtime";
import {
  BuildStageInputSchema,
  BuildStageOutputSchema,
  type BuildStageInput,
  type BuildStageOutput,
} from "./contracts";

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
- land on a transferable principle without becoming abstract mush`;

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
- Use this order internally: disrupt, rebuild, ground, land.
- Continuous prose only. No lists. No headings.
- Tone: sharp, respectful, demanding.
- End with exactly one transferable principle sentence.

Requirements for workedExample:
- Make the mechanism visible.
- Use a realistic example, not toy fluff.
- The example should directly counter the learner's likely misconception.

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
Why it matters: ${input.node.whyItMatters}
Worked example brief: ${input.seed.workedExampleBrief}
Proof targets: ${input.seed.proofTargets.join("; ")}
Learner seed response:
${input.learnerSeedResponse}`;
