import { z } from "zod/v4";

/**
 * Every phase agent's structured output is just the learner-facing reply.
 * There is no verdict field here — Connect/Solve's verdict comes from
 * whether (and how) the grading tool was called, not from a schema field
 * competing with the reply for the model's attention. See fsm-tools.ts.
 */
export const PhaseAgentOutputSchema = z.object({
  assistantMessage: z.string().min(1),
});

export type PhaseAgentOutput = z.infer<typeof PhaseAgentOutputSchema>;
