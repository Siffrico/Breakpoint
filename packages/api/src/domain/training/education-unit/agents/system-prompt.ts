import { educationUnitTutorPersona } from "../../prompts/main-personas";

/** Shared persona block + a phase-specific instruction, one system string per phase. */
export const buildPhaseSystemPrompt = (phaseInstruction: string): string => {
  const persona = educationUnitTutorPersona;
  return `${persona.role}

Expertise:
${persona.expertise.map((line) => `- ${line}`).join("\n")}

Constraints:
${persona.constraints.map((line) => `- ${line}`).join("\n")}

${persona.outputExpectation}

${phaseInstruction}`;
};
