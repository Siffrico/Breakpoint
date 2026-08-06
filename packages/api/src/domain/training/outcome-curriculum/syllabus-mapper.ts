// outcome-curriculum/syllabus-mapper.ts
//
// One outcome's syllabus: the enumeration of what legitimately VARIES between
// tasks that all demand the same main outcome.
//
// This is what makes an outcome finite. Because the main outcome is fixed, the
// space of things that can differ between two tasks is bounded, and once that
// space is enumerated the plan knows both what to generate next (the
// least-covered axis) and when the learner has actually been tested across the
// whole thing rather than the handful of axes the generator happened to like.

import type { SubtypeBlueprint, SyllabusOutput } from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { SyllabusOutputSchema } from "./contracts";

export interface SyllabusInput {
  targetIdentity: string;
  outcomeTitle: string;
  mainOutcome: string;
  summary: string;
  /** The solve procedure for one task under this outcome. */
  workflow: { name: string; steps: string[] };
  exitCriteria: string[];
  blueprint?: SubtypeBlueprint;
}

const SYLLABUS_MAPPER_SYSTEM = `You enumerate what VARIES between tasks that all demand the same main outcome.

You are given one outcome: a fixed demand, and the solve procedure a performer runs to meet it. Every task under this outcome asks for the same thing. Your job is to name the dimensions along which two such tasks can legitimately differ, and the knowledge a performer needs to handle each.

This is not a topic outline. A topic outline lists what a book about this would cover. You are listing where the solve procedure's judgments can come out differently — because that, and only that, is what makes one task different from another while still measuring the same outcome.

HOW TO FIND THE AXES.
Walk the solve procedure step by step. At each step, ask: what could be different about a task that changes how a performer executes this step? Those differences are your axes. A step that executes identically on every task contributes no axis.
Then ask what makes each step go wrong. The ways a competent performer's judgment gets misled are axes too, and they are usually the most valuable ones — they are what a good task is engineered around.
An axis is real when you can describe two tasks that sit at different points on it and would genuinely be handled differently. If you cannot, you have written a category, not an axis.

Right, for an outcome whose demand is "the single defensible answer for a word in context, justified from the text": the constraint is carried by a contrast word rather than stated directly; two options are both defensible and one is over-specified; the constraint sits in the sentence after the blank rather than around it; the word's common meaning conflicts with its contextual one.
Each of those describes real tasks that differ in a way the performer must handle. Each is engineered into an item on purpose.

Wrong, for that same outcome: "vocabulary", "reading comprehension", "context clues", "hard words". Those are chapters. None of them describes a way two tasks differ, and none tells a generator anything it can build from.

PHRASING.
Write each axis in second person, ending in a question mark, naming something the performer must be able to do or discern — "How do you ...?" by default, "When ...?" or "Which ...?" for discriminations, "Why ...?" for mechanisms. Never a heading. Never a question whose honest answer is a definition rather than a structure.
Order the axes by dependency: an axis a performer needs before they can handle a later one comes first.

THE ITEMS.
Under each axis, emit only the knowledge needed to handle it. An item is one of:
- concept: something that is true, and under which conditions. Its content states the distinction or mechanism, not a label for it.
- mechanism: an executable move. Its content starts with a concrete verb and states when to perform it and what it produces.
Bad concept — label "context clues", content "using context to determine meaning". That names a topic and teaches nothing.
Good concept — label "constraint carried by contrast", content "a contrast word makes the blank take a meaning opposed to the clause it contrasts with, so the constraint is fixed even when nothing states it directly".
Bad mechanism — label "read carefully", content "read the passage carefully".
Good mechanism — label "predict before reading options", content "State the meaning the constraint requires before looking at any option, so the options are tested against the constraint rather than against each other."
Two or three items per axis is usual. Never pad to a quota, and never repeat an item under a second axis — it belongs to the earliest axis that needs it and is assumed known after that.

Write everything for the target identity as stated. Never teach below what that performer already knows, and never lean on knowledge above it without stating that knowledge as its own item first.

BEFORE RETURNING.
Could a generator holding exactly these axes produce a genuinely varied set of tasks that all still demand the main outcome? If two axes would produce indistinguishable tasks, merge them. If a task you can easily imagine has no axis it belongs to, add the missing axis.
Then check the bar: if a learner handled every axis here confidently, would they reliably meet this main outcome? If not, something is missing. If an axis could be dropped without weakening that, cut it.

Search for how this outcome is actually assessed or actually fails in practice, and use it to check received wisdom rather than to collect more of it.`;

export const designOutcomeSyllabus = async (
  input: SyllabusInput,
): Promise<SyllabusOutput> =>
  runResilientAgent({
    agent: "knowledgeMapper",
    system: SYLLABUS_MAPPER_SYSTEM,
    schema: SyllabusOutputSchema,
    errorMessage: "Failed to generate the outcome syllabus.",
    prompt: `Enumerate what varies between tasks under this outcome.

Target identity: ${input.targetIdentity}
Outcome: ${input.outcomeTitle}
Main outcome (every task demands exactly this): ${input.mainOutcome}
Summary: ${input.summary}

Solve procedure for one task — ${input.workflow.name}:
${input.workflow.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}

Mastery exit criteria:
${input.exitCriteria.map((criterion) => `- ${criterion}`).join("\n")}

${formatBlueprint(input.blueprint)}`,
  });

const formatBlueprint = (blueprint?: SubtypeBlueprint): string =>
  !blueprint
    ? "No pre-authored subtype blueprint is available. Derive the syllabus from the outcome."
    : `Authoritative subtype blueprint. Preserve its knowledge/cognition separation; turn its content into syllabus items and axes rather than inventing a topic outline.
Declarative knowledge:
${blueprint.declarativeKnowledge.map((item) => `- ${item.label}: ${item.statement} (${item.applicability})`).join("\n")}
Expert heuristics:
${blueprint.cognitiveHeuristics.expertMentality.map((item) => `- ${item}`).join("\n")}
Common traps:
${blueprint.cognitiveHeuristics.commonTraps.map((item) => `- ${item.trap}: ${item.whyItIsTempting}; cue: ${item.detectionCue}`).join("\n")}
Progression axes:
${blueprint.progression.complexityAxes.map((item) => `- ${item}`).join("\n")}
Difficulty bands:
${blueprint.progression.bandBriefs.map((item) => `- band ${item.band}: ${item.caseShape} Withheld: ${item.withheldGivens} Near-misses: ${item.embeddedAlternatives}`).join("\n")}
Task contexts:
${blueprint.taskVariations.map((item) => `- ${item.context}: ${item.applicability}; pressure: ${item.addedPressure}`).join("\n")}`;
