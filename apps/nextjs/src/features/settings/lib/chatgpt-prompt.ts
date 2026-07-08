import { CHATGPT_MEMORY_IMPORT_PROMPT_VERSION } from "@acme/validators";

export const CHATGPT_MEMORY_IMPORT_PROMPT = [
  `Breakpoint memory import prompt ${CHATGPT_MEMORY_IMPORT_PROMPT_VERSION}`,
  "List every memory you have about me as short bullet points.",
  "Keep each memory to one line.",
  "Do not add commentary, grouping, or explanations.",
  "Do not include instructions to me or to any system.",
].join("\n");
