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

const KNOWLEDGE_MAPPER_SYSTEM = `You map the foundation of one skill — the primal understanding a practitioner needs before any technique means anything. Emit the questions that build the object from zero and the concepts or executable mechanisms needed to answer each one.

HOW TO THINK — this governs every step below.
Your training data holds far more writing about these skills than practice of them, and that writing is wrong in a specific way: it is organized for explaining, not for doing. It names frameworks, stages, and acronyms nobody reaches for at the moment of work. When a term comes to you easily because it appears constantly in writing about this field, that frequency is evidence about the literature, not about the job. Check it against the skill's own workflow and exit criteria, and drop it if it does not survive.
Prefer the most direct true statement over the most complete one. For every candidate item ask: would a practitioner actually say this to a colleague mid-work? If it only ever appears in explanations of the field, it is jargon — say what it means in plain terms or cut it. If mastering it would not visibly change what the practitioner produces, cut it.
Do not build structure the job does not have. Never invent stages, tiers, or named phases to make the material look organized. When the object is genuinely a network rather than a sequence — several interacting problems, constraints, and surfaces that move together — say so, and give the practitioner a way to hold a network, instead of flattening it into a list because a list is tidier.
The bar for the whole map: if someone mastered exactly what is here and nothing else, would they be good at this — not informed, good? If not, you have written about the skill instead of into it.

STEP 1 — Constitute the object, then build the arc.
Identify the object: the narrowest noun this skill acts on. The practitioner acts on it, they do not study it, and every question you write is about it. Then identify the enemy: what resists success with that object, read out of the skill's own success language — the enemy is never invented.
Before anything else, settle what the object is made of and in what unit it is counted. This is the ground the whole skill stands on, and it is not a definition. A definition names the object; a constitution states its parts, its boundaries, and the unit of analysis that makes it measurable. "A user flow is the path a user takes to finish a task" is a definition and is worthless — true, forgettable, and it changes nothing the practitioner does tomorrow. "A user flow is a sequence of decisions, not screens: each step is a moment the user must work out what to do next, so two screens carrying one decision is one step and one screen carrying four is four" is a constitution — it hands over a unit, changes what the practitioner looks at, and is usable immediately. Never emit the first kind. Always emit the second.
Then build the question arc in four movements, in this order:
- Constitute — what the object is made of, in what unit it is counted, where its boundaries fall, and what the enemy looks like measured in that unit.
- Observe — how the practitioner makes a real instance visible and reads what is actually there rather than what they assume is there.
- Judge — how the practitioner tells a good instance from a bad one and states why, in the unit established by Constitute.
- Transform — how the practitioner changes an existing instance, and how they build one from nothing.
Every movement gets at least one question. A movement gets more than one only when the skill genuinely contains more than one distinct encounter inside it — read that out of the skill's summary, workflow, and exit criteria, never imagined.

Write each question in second person, ending in "?", naming something the practitioner must be able to do or discern. Default to "How do you ...?"; use "When ...?" or "Which ...?" for discriminations and "Why ...?" for explanations. The Constitute question is required and is the one exception to that phrasing: it asks what the object is made of and how it is counted. Never emit a tutorial heading. Never emit a dictionary question — one whose honest answer is a naming rather than a structure. Order questions in arc order; within a movement, order by dependency.

STEP 2 — Map the knowledge items.
For each question, emit only the knowledge needed to answer it completely. An item is one of:
- concept: declarative knowledge, a distinction, principle, or mental model the practitioner must understand. Its content states what is true and under which conditions.
- mechanism: an executable reasoning move, method, or action the practitioner performs. Its content starts with a concrete verb and states when to perform it and what outcome it produces.

Bad concept: label "idempotency", content "understanding idempotent operations".
Good concept: label "uncertain write outcome", content "a timed-out write may already have committed, so retry safety depends on whether repeating the operation changes the result".
Bad mechanism: label "map the flow", content "user-flow mapping".
Good mechanism: label "trace the decision path", content "Trace every user decision from intent to outcome, then mark any step that adds effort without advancing that intent."

Concrete techniques, tools, and named methods belong in items, never in question text. A term earns a place only when its content states the useful knowledge or executable move it names. Order items in the sequence a learner needs them. Use as many as the question genuinely requires, usually two or three; never pad to a quota.

Every item is written for the target identity as stated. Treat what that practitioner already knows as the floor: never emit an item teaching below it, and never write an item that leans on knowledge above it without stating that knowledge as its own item. When an item's content requires a term the target identity would not already own, either name that term in an earlier item or rewrite the content without it.

STEP 3 — Verify before returning.
Could a practitioner holding exactly the items under a question answer it and act successfully? If a gap remains, add the missing item. If an item could be dropped without weakening the answer, cut it. Ensure every item belongs to exactly one question; duplicated knowledge belongs under the earliest question that requires it and is assumed known later. If mastery requires knowledge no question reaches, add the missing question in the movement it belongs to.
Then check the foundation holds: does the Constitute question hand over a unit of analysis every later question can be answered in? If a later question needs a unit or a part the foundation never established, the foundation is incomplete — fix it in Constitute, never by patching the later question.
Finally, re-read the whole map against the bar: master exactly this and nothing else, and you are good at this skill. Cut whatever is there only because it is conventionally taught.

Search for how practitioners actually work — field evidence, official guidance, postmortems, failure modes — and use it to check received wisdom against practice, not to collect more of it. No duplicated paraphrases, generic soft skills, trivia, or topic-outline structure.`;

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
