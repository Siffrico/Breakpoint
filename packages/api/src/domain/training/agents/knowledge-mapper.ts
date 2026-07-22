import type { KnowledgeMapOutput } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { KnowledgeMapOutputSchema } from "./contracts";

export interface KnowledgeMapSkillInput {
  title: string;
  summary: string;
  targetIdentity: string;
  workflow: { name: string; steps: string[] };
  masteryContract: { exitCriteria: string[] };
}

const KNOWLEDGE_MAPPER_SYSTEM = `You map the knowledge behind one skill — one recurring workflow moment where expertise changes the outcome. Emit the practitioner questions the learner must become able to answer and the concepts or executable mechanisms needed to answer each one.

STEP 1 — Derive the questions.
Read the skill as a job, not a topic: state what the practitioner is trying to achieve as a verb acting on the world. If you catch yourself thinking in definitions ("what is X", "the types of X"), you read it as a topic — start over.
Then determine the practitioner's relationship to the material: custodian of artifacts they build, inherit, and keep working; performer on handed material under constraint; steward of an opaque system they intervene in through partial information; decision-maker allocating under uncertainty — or characterize it fresh when none fit. Never force a fit. That relationship determines the encounter structure: enumerate the distinct recurring situations reality puts this practitioner in inside this workflow moment. Enumerate, don't brainstorm — every situation must be read out of the skill's own definition (summary, workflow, exit criteria), never imagined.
Finally, identify the object and the enemy. Object: the narrowest noun every situation revolves around. Enemy: what resists success, read out of the skill's own success language — the enemy is never invented.

Write one durable question per situation. Each question is second-person, ends in "?", and names a real practitioner decision or action. Default to "How do you ...?"; use "When ...?" or "Which ...?" for discriminations and "Why ...?" for explanations. Never emit a tutorial heading or a definitional question. Order questions by dependency and increasing judgment difficulty.

STEP 2 — Map the knowledge items.
For each question, emit only the knowledge needed to answer it completely. An item is one of:
- concept: declarative knowledge, a distinction, principle, or mental model the practitioner must understand. Its content states what is true and under which conditions.
- mechanism: an executable reasoning move, method, or action the practitioner performs. Its content starts with a concrete verb and states when to perform it and what outcome it produces.

Bad concept: label "idempotency", content "understanding idempotent operations".
Good concept: label "uncertain write outcome", content "a timed-out write may already have committed, so retry safety depends on whether repeating the operation changes the result".
Bad mechanism: label "map the flow", content "user-flow mapping".
Good mechanism: label "trace the decision path", content "Trace every user decision from intent to outcome, then mark any step that adds effort without advancing that intent."

Concrete techniques, tools, and named methods belong in items, never in question text. A term earns a place only when its content states the useful knowledge or executable move it names. Order items in the sequence a learner needs them. Use as many as the question genuinely requires, usually two or three; never pad to a quota.

STEP 3 — Verify before returning.
Could a practitioner holding exactly the items under a question answer it and act successfully? If a gap remains, add the missing item. If an item could be dropped without weakening the answer, cut it. Ensure every item belongs to exactly one question; duplicated knowledge belongs under the earliest question that requires it and is assumed known later. If mastery requires knowledge no question reaches, add the missing situation question.

Search for current practitioner evidence, official guidance, postmortems, and field-specific failure modes. No duplicated paraphrases, generic soft skills, trivia, or topic-outline structure.`;

export const designSkillKnowledge = async (
  skill: KnowledgeMapSkillInput,
): Promise<KnowledgeMapOutput> =>
  runResilientAgent({
    agent: "knowledgeMapper",
    system: KNOWLEDGE_MAPPER_SYSTEM,
    schema: KnowledgeMapOutputSchema,
    errorMessage: "Failed to generate the skill knowledge map.",
    prompt: `Build the ordered knowledge map for this skill. Everything below is the skill's definition — the evidence you derive situations from.

Target identity: ${skill.targetIdentity}
Skill: ${skill.title}
Summary: ${skill.summary}
Workflow moment: ${skill.workflow.name}
Workflow steps:
${skill.workflow.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}
Mastery exit criteria:
${skill.masteryContract.exitCriteria.map((criterion) => `- ${criterion}`).join("\n")}`,
  });
