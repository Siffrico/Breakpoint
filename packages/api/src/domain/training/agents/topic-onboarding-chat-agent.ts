// agents/topic-onboarding-chat-agent.ts
//
// The onboarding consultant's runtime wiring. It mirrors
// onboarding-chat-agent.ts and deliberately reuses that module's shared parts
// (the starting-point tool, the name normalizer, the readiness backstop)
// rather than restating them — only the persona and the createProject shape
// differ between the two modes.

import { tool } from "ai";
import { z } from "zod/v4";

import {
  OutcomeDefinitionSchema,
  StartingPointTierSchema,
} from "@acme/validators";

import type { CreateProjectInput } from "../orchestration/build-project";
import type { CreateProjectResult } from "./onboarding-chat-agent";
import {
  MAX_OUTCOMES_PER_PLAN,
  MIN_OUTCOMES_PER_PLAN,
} from "../outcome-curriculum/contracts";
import { TOPIC_SCOPE_CONSULTANT_SYSTEM } from "../prompts/personas/topic-scope-consultant";
import { LearnerUnderstandingSchema } from "./contracts";

const TOPIC_ONBOARDING_RUNTIME_NOTES = `Runtime notes for this session:
- The learner has already been shown the opener "What do you want to get good at, and what would you be able to do once you were?" — their first message is the answer. Continue from there; do not re-ask it and do not paraphrase their answer back as a question.
- Follow the interview mechanics: one question per turn, a mirror at least every three questions, stop as soon as you know all five, readback before proposing outcomes. Do not jump from recognizing the topic to a breakdown: normally ask at least three focused follow-ups that establish the desired work or result, its quality bar and environment, and the learner's current difficulty. The 15-question ceiling covers this whole session.
- Call the askStartingPoint tool exactly once, after you know the topic but before you propose outcomes.
  - question: one short sentence asking where they are in THAT topic right now, in their own language.
  - options: 3–4 concrete behavioral facts they can tap, each a real thing a learner here has or hasn't done ("I've shipped a backend that other people used", "I've followed tutorials but never deployed"). Each carries a tier: fundamentals | skip_basics | advanced. Never use level words in a label, and never say "band".
  - If they answer in prose instead of tapping, accept it, infer the tier, and continue. Never re-ask.
  - Acknowledge in at most one short sentence, then move on.
- Only once the learner has explicitly confirmed the outcome split you proposed: call the createProject tool.
  - projectName: the core topic only, lowercase — e.g. "sat", "backend engineering". Not a sentence, not an identity phrase.
  - targetIdentity: one short phrase for who they are becoming.
  - summary: one line describing what mastering this means for them, in their words.
  - outcomes: the exact ${MIN_OUTCOMES_PER_PLAN}–${MAX_OUTCOMES_PER_PLAN} title-and-result pairs the learner confirmed. The title uses the domain's real language. The result states the observable performance this outcome produces. Preserve both exactly and keep their confirmed order.
  - startingPoint: { tier, reason } — the tier they settled on, and a reason paraphrasing something they actually said or tapped.
  - understanding: { build, goodMeans, currentGap } — your reading of them, shown on the confirm card as the last thing they see before the build. Say what you concluded, not what they typed: "I keep overcomplicating things" becomes a goodMeans of "simple". Only claim what the interview supports; if one of the three would be a guess, ask about it before calling this.
- createProject pauses for the learner to confirm with a button — do not announce it, do not ask permission in text, just call it. After it returns ok:true, write one short closing line.
- If it returns ok:false because more signal is needed, continue with one short question. For other failures, apologize briefly and ask if they want to retry.
- Never call createProject before the learner has confirmed every outcome title and result. Show each as “Title — observable result.” If they edit the list, show the revised pairs and get confirmation of that exact list first.

Search policy:
- Before proposing outcomes, decide which sources would provide the strongest evidence for this learner's exact goal. Search those sources thoroughly, cross-check important claims, and avoid relying on convenient but weak or biased sources.
- Use the terminology and task boundaries the strongest evidence supports. Do not guess when search can resolve uncertainty.`;

export const TOPIC_ONBOARDING_CHAT_SYSTEM = `${TOPIC_SCOPE_CONSULTANT_SYSTEM}

${TOPIC_ONBOARDING_RUNTIME_NOTES}`;

/** The exact learner-confirmed outcomes handed to curriculum generation. */
export const CreateTopicProjectInputSchema = z.object({
  projectName: z
    .string()
    .min(1)
    .describe(
      'The core topic only, lowercase — for example "sat" or "backend engineering". Not a sentence and not an identity phrase.',
    ),
  targetIdentity: z
    .string()
    .min(1)
    .describe("One short phrase for who the learner is becoming."),
  summary: z
    .string()
    .min(1)
    .describe(
      "One line describing what mastering this topic means for this learner, in their words.",
    ),
  outcomes: z
    .array(OutcomeDefinitionSchema)
    .min(MIN_OUTCOMES_PER_PLAN)
    .max(MAX_OUTCOMES_PER_PLAN)
    .describe(
      "The exact domain-native title and observable result pairs the learner confirmed, in learning order.",
    ),
  startingPoint: z
    .object({
      tier: StartingPointTierSchema,
      reason: z
        .string()
        .min(1)
        .describe(
          "A short reason paraphrasing something the learner actually said or tapped.",
        ),
    })
    .describe(
      "Where the learner is starting from, settled during the interview.",
    ),
  understanding: LearnerUnderstandingSchema.describe(
    "Your reading of this learner, shown on the confirm card as the last thing they see before the build. Approving it is them agreeing you understood them, so state what you actually concluded — synthesis is expected, but never assert anything the interview did not support.",
  ),
}) satisfies z.ZodType<CreateProjectInput>;

/**
 * Built per-request inside the chat stream so its `execute` closes over the
 * live progress writer and the session's persistence deps. Identical lifecycle
 * to the project creation tool.
 */
export const createCreateTopicProjectTool = ({
  buildProject,
}: {
  buildProject: (input: CreateProjectInput) => Promise<CreateProjectResult>;
}) =>
  tool({
    description:
      "Provision the learner's project once they have explicitly confirmed the outcome split you proposed. Shows them your reading of what they want and pauses for their approval, then builds and saves the full curriculum server-side.",
    inputSchema: CreateTopicProjectInputSchema,
    needsApproval: true,
    execute: async (input): Promise<CreateProjectResult> => buildProject(input),
  });
