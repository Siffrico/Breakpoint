import type { PromptTemplate } from "../types";
import {
  debateRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
  legacyCapstoneDesignPrompt,
  teachRoundPrompt,
} from "./capstone";

export {
  legacyCapstoneDesignPrompt,
  debateRoundPrompt,
  teachRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
} from "./capstone";

export { legacyCapstoneDesignPrompt as capstoneAgentPrompt } from "./capstone";

const LEGACY_PROMPTS: PromptTemplate[] = [
  legacyCapstoneDesignPrompt,
  debateRoundPrompt,
  teachRoundPrompt,
  evaluateBuildPrompt,
  evaluateDebatePrompt,
  evaluateTeachPrompt,
];

export const getPrompt = (id: string): PromptTemplate => {
  const found = LEGACY_PROMPTS.find((prompt) => prompt.id === id);
  if (!found) {
    throw new Error(`Prompt template not found: ${id}`);
  }
  return found;
};

export const listPrompts = (): {
  id: string;
  version: number;
  tier: string;
}[] =>
  LEGACY_PROMPTS.map((prompt) => ({
    id: prompt.id,
    version: prompt.version,
    tier: prompt.tier,
  }));
