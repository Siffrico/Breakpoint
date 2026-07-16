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
