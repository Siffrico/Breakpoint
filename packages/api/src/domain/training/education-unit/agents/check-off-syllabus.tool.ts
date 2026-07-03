import { tool } from "ai";
import { z } from "zod/v4";

export const CheckOffSyllabusInputSchema = z.object({
  entryIds: z.array(z.string().min(1)).min(1).max(3),
  evidence: z.string().min(1),
});

export const checkOffSyllabus = tool({
  description:
    "Mark only this unit's syllabus targets that the learner demonstrated in the completing evaluation.",
  inputSchema: CheckOffSyllabusInputSchema,
});
