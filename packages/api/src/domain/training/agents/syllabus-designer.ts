import type { SyllabusOutput } from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";
import { SyllabusOutputSchema } from "./contracts";

export interface SyllabusSkillInput {
  title: string;
  summary: string;
  targetIdentity: string;
  workflow: { name: string; steps: string[] };
  masteryContract: { exitCriteria: string[] };
}

const SYLLABUS_DESIGNER_SYSTEM = `You design a knowledge frontier for one expert workflow.

Produce 20-60 ordered syllabus entries from novice footholds to expert precision. Entries are not lessons or units. They are the discriminations, concepts, subskills, and vocabulary a learner must reliably use while performing the workflow.

Weight the ladder toward discriminations: what experts can tell apart that weaker performers collapse together. Use concepts and vocabulary only where they support action and causal explanation. Use subskills for compact recurring moves, never large artifact production.

Search for current practitioner evidence, official guidance, postmortems, and field-specific failure modes. Order by dependency and increasing judgment difficulty. Each gloss must say what precise performance the entry enables or what confusion it prevents. Avoid duplicated paraphrases, generic soft skills, and topic-outline structure.`;

export const designSyllabus = async (
  skill: SyllabusSkillInput,
): Promise<SyllabusOutput> =>
  runAgent({
    agent: "syllabusDesigner",
    system: SYLLABUS_DESIGNER_SYSTEM,
    schema: SyllabusOutputSchema,
    errorMessage: "Failed to generate the skill syllabus.",
    prompt: `Build the ordered knowledge frontier for this skill.

Target identity: ${skill.targetIdentity}
Skill: ${skill.title}
Summary: ${skill.summary}
Workflow: ${skill.workflow.name}
Workflow steps:
${skill.workflow.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}
Mastery exit criteria:
${skill.masteryContract.exitCriteria.map((criterion) => `- ${criterion}`).join("\n")}`,
  });
