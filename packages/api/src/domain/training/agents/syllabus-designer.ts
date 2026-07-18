import type { SyllabusOutput } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { SyllabusOutputSchema } from "./contracts";

export interface SyllabusSkillInput {
  title: string;
  summary: string;
  targetIdentity: string;
  workflow: { name: string; steps: string[] };
  masteryContract: { exitCriteria: string[] };
  topics?: { slug: string; title: string; gloss: string; coreIdea: string }[];
}

const CONCEPT_MAPPER_SYSTEM = `You map the concepts behind one skill — one recurring workflow moment where expertise changes the outcome.

Produce 6-24 ordered entries. Every entry MUST be stated as a causal mechanism, never a topic label. The mechanism field is a falsifiable claim of the form "X under condition Y causes Z" — concrete enough that a scenario where it fires could be built from the sentence alone.

Bad: label "idempotency", mechanism "understanding idempotent operations".
Good: label "retry double-execution", mechanism "retrying a non-idempotent write after a timeout executes the side effect twice, because the first attempt may have succeeded before the timeout fired".

Each knowledge topic is a situation-level capability question that deliberately contains no tools or named methods — your entries are that question's answer tier, so the concrete techniques, tools, and named methods a practitioner reaches for in that situation belong here, each stated as the causal mechanism that makes it work. Assign every entry with this reasoning process:
1. Ask which topic's question this mechanism is load-bearing for, and attach that topicSlug. If the mechanism helps answer no topic's question, it is trivia: cut it.
2. After assigning everything, re-read each question against its attached entries: could a learner who has exactly these mechanisms, plus earlier topics, answer the question fully? If a gap remains, add the missing entry. If an entry could be dropped without weakening the answer, cut it.
Some questions genuinely need five or more entries and some need one; never pad or trim toward a fixed count.\n\nEntry kinds:
- discrimination: two situations experts tell apart that novices collapse; the mechanism states what differs causally and what goes wrong when collapsed.
- concept: a causal model the skill's decisions rest on.
- subskill: a compact recurring move; the mechanism states why the move works.
- vocabulary: a term the field uses; the mechanism states the causal fact the term names — vocabulary without a mechanism is trivia and must be cut.

Weight toward discriminations and concepts. Search for current practitioner evidence, official guidance, postmortems, and field-specific failure modes. Order by dependency and increasing judgment difficulty. Each gloss says what precise performance the entry enables or what confusion it prevents. No duplicated paraphrases, no generic soft skills, no topic-outline structure.`;

export const designSyllabus = async (
  skill: SyllabusSkillInput,
): Promise<SyllabusOutput> =>
  runResilientAgent({
    agent: "syllabusDesigner",
    system: CONCEPT_MAPPER_SYSTEM,
    schema: SyllabusOutputSchema,
    errorMessage: "Failed to generate the skill concept map.",
    prompt: `Build the ordered concept map for this skill.

Target identity: ${skill.targetIdentity}
Skill: ${skill.title}
Summary: ${skill.summary}
Workflow moment: ${skill.workflow.name}
Workflow steps:
${skill.workflow.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}
Mastery exit criteria:
${skill.masteryContract.exitCriteria.map((criterion) => `- ${criterion}`).join("\n")}
Knowledge topics (attach entries to these slugs):
${skill.topics?.map((topic) => `- ${topic.slug}: ${topic.title} — ${topic.coreIdea}`).join("\n") ?? "No topic model is available; use null topicSlug."}`,
  });
