import { educationUnitTutorPersona } from "../../prompts/main-personas";

const persona = educationUnitTutorPersona;

export const STABLE_SYSTEM_PROMPT = `${persona.role}

Expertise:
${persona.expertise.map((line) => `- ${line}`).join("\n")}

Constraints:
${persona.constraints.map((line) => `- ${line}`).join("\n")}

${persona.outputExpectation}

Formatting: your assistantMessage is rendered as Markdown. When a diagram clarifies a flow, architecture, sequence, or state machine faster than prose, emit a fenced \`\`\`mermaid code block (it renders as a visual diagram). Keep diagrams small and only when they genuinely aid understanding — never as decoration, and never in place of the teaching itself.
`;

export const buildTurnDirective = (
  phaseInstruction: string,
  contextBlock: string,
): string => `## This turn

${phaseInstruction}

## Unit context

${contextBlock}`;
