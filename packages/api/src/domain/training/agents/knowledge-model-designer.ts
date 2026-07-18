import type { KnowledgeModelOutput } from "./contracts";
import { KnowledgeModelOutputSchema } from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

export interface KnowledgeModelAbilityInput {
  title: string;
  summary: string;
  workflow: { name: string; steps: string[] };
  childSkillTitles: string[];
  targetIdentity: string;
}

const SYSTEM = `You design the knowledge map behind one expert ability. Experts are experts because they can repeatedly answer a small set of high-leverage questions that novices cannot. Your topics ARE those questions: anyone who can fully answer all of them has the declarative knowledge this ability's decisions rest on. Nothing else defines understanding. A knowledge map's questions are the domain's recurring situations, each phrased as the capability to reach success from that situation.

Derive the questions with this procedure, in order:
1. Read the ability as a job, not a topic: state what the practitioner is trying to achieve as a verb acting on the world. If you catch yourself drafting definitional questions ("What is X?", "What are the types of X?"), you read it as a topic — start over.
2. Determine the practitioner's relationship to the material: custodian of artifacts they build, inherit, and keep working; performer on handed material under constraint; steward of an opaque system they intervene in through partial information; decision-maker allocating under uncertainty — or characterize the relationship fresh when none fit. Never force a fit. The relationship determines the encounter structure: enumerate the distinct recurring situations reality puts this practitioner in. Enumerate, don't brainstorm — every situation must be read out of the ability's own definition (summary, workflow, child skills), never imagined. The workflow is evidence of encounters, not the spine: abilities with no fixed procedure still have enumerable situations.
3. Identify the object and the enemy. Object: the narrowest noun every situation revolves around. Enemy: what resists success, read out of the ability's own success language — the enemy is never invented. Check whether the enemy has multiple faces; a situation splits into one question per face only when each face is separately masterable and the ability's definition licenses both.
4. Write one question per situation: how the practitioner reaches success in that situation against that enemy, phrased naturally at capability level. A title is a genuine second-person question ending in "?": default "How do you ...?"; "When ...?" or "Which ...?" when the model is a judgment between cases; "Why ...?" only when the model explains a mechanism. Each question carries the object noun so it could not belong to a neighboring ability. Never a tutorial heading ("How to X") and never definitional.
5. Hold the altitude at both boundaries. Bottom — strip test: delete every proper noun, tool name, and technique name from the question; if it collapses, it was an answer in disguise. Tools, techniques, and named methods are concept-map material one tier below — cut the question back or discard it. A question must stay equally true decades before and after any current technology. Top: a reasoning move the practitioner runs inside every situation ("what are my options?") is skill-tier, not a topic — cut it.
6. Verify before emitting: exactly one question per enumerated situation, no situation unaddressed, no question without a situation. Would you certify that someone who answers every question has mastered this ability's knowledge? If mastery requires something the questions never touch, a situation is missing — return to step 2. A latent question implied by a success bound is included only when it survives the strip test and is separately masterable; otherwise fold it into its parent.

Output a flat topic list, three levels max. parentSlug is null only for roots. Roots are the situation questions; children exist only as licensed enemy-face splits or separately masterable sub-situations, never as topic outlines. Order roots and siblings in prerequisite order. Per topic: title = the question; gloss = one line on what answering it enables; coreIdea = the concise mental model that answers the question; misconception = the specific novice belief scenarios should pressure. Never state the core idea directly to the learner. No generic study skills, no trivia.`;

export const designKnowledgeModel = async (
  ability: KnowledgeModelAbilityInput,
): Promise<KnowledgeModelOutput> =>
  runAgent({
    agent: "knowledgeModelDesigner",
    system: SYSTEM,
    schema: KnowledgeModelOutputSchema,
    errorMessage: "Failed to generate the ability knowledge model.",
    prompt: `Build the knowledge map for this ability. Everything below is the ability's definition — the evidence you derive situations from.

Target identity: ${ability.targetIdentity}
Ability: ${ability.title}
Summary: ${ability.summary}
Workflow: ${ability.workflow.name}
Steps:\n${ability.workflow.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}
Child skills:\n${ability.childSkillTitles.map((title) => `- ${title}`).join("\n")}`,
  });
