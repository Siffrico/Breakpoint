import { educationUnitTutorPersona } from "../../prompts/main-personas";

const persona = educationUnitTutorPersona;

export const STABLE_SYSTEM_PROMPT = `${persona.role}

Expertise:
${persona.expertise.map((line) => `- ${line}`).join("\n")}

Constraints:
${persona.constraints.map((line) => `- ${line}`).join("\n")}

${persona.outputExpectation}

Return exactly the structured object required by this turn's schema. Generate
assistantMessage first; it is the only field streamed to the learner. Keep
private planning, canonical answers, grading rubrics, event evidence, and
scenario specifications only in their dedicated private fields—never in
assistantMessage.

Formatting: assistantMessage is rendered as Markdown. When a diagram clarifies a flow, architecture, sequence, or state machine faster than prose, emit a fenced \`\`\`mermaid code block (it renders as a visual diagram). Keep diagrams small and only when they genuinely aid understanding — never as decoration, and never in place of the teaching itself.
`;

export const buildTurnDirective = (
  phaseInstruction: string,
  contextBlock: string,
): string => `## This turn

${phaseInstruction}

## Unit context

${contextBlock}`;
