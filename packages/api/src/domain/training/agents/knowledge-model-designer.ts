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

const SYSTEM = `You design the prerequisite mental-model structure behind one expert ability.

Emit a flat topic list. parentSlug is null only for a root topic. Decompose by the declarative-knowledge job, recurse until one idea carries a topic, and cut where the field naturally cuts. Build from foundations upward: a prerequisite model must be a real topic with concepts of its own, never an empty heading. Include no gaps, no generic study-skills, and no trivia. A topic is the causal model a learner must construct to make expert workflow decisions.

Every topic title is the main practitioner question whose full answer IS that mental model. Derive the topics with this reasoning process, in order:
1. Walk the ability's workflow step by step and list what a practitioner must already understand for each step to be executable. Each is a candidate mental model.
2. For each candidate, write the one question a working practitioner actually asks whose answer is that model. That question becomes the topic title.
3. Right-size by test, not by count: if answering the question honestly requires two separate causal models, split it into two topics. If two questions can only ever be answered together, merge them into one.
4. A title must be a genuine second-person question ending in "?": default "How do you ...?"; use "When ...?" or "Which ...?" when the model is a judgment between cases; use "Why ...?" when the model explains a mechanism. Never a tutorial heading ("How to X") and never a definitional question ("What is X?").

The tree is limited to three levels. Order roots and siblings in prerequisite order. Every topic needs a concise coreIdea and the specific misconception its scenarios should pressure; never state the core idea directly to the learner.`;

export const designKnowledgeModel = async (
  ability: KnowledgeModelAbilityInput,
): Promise<KnowledgeModelOutput> =>
  runAgent({
    agent: "knowledgeModelDesigner",
    system: SYSTEM,
    schema: KnowledgeModelOutputSchema,
    errorMessage: "Failed to generate the ability knowledge model.",
    prompt: `Build the knowledge model for this ability.

Target identity: ${ability.targetIdentity}
Ability: ${ability.title}
Summary: ${ability.summary}
Workflow: ${ability.workflow.name}
Steps:\n${ability.workflow.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}
Child skills:\n${ability.childSkillTitles.map((title) => `- ${title}`).join("\n")}`,
  });
