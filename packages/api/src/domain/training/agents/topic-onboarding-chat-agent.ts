// agents/topic-onboarding-chat-agent.ts
//
// The topic-mode consultant's runtime wiring. It mirrors
// onboarding-chat-agent.ts and deliberately reuses that module's shared parts
// (the starting-point tool, the name normalizer, the readiness backstop)
// rather than restating them — only the persona and the createProject shape
// differ between the two modes.

import { tool } from "ai";
import { z } from "zod/v4";

import { StartingPointTierSchema } from "@acme/validators";

import type { CreateProjectInput } from "../orchestration/build-project";
import type { CreateProjectResult } from "./onboarding-chat-agent";
import {
  MAX_OUTCOMES_PER_PLAN,
  MIN_OUTCOMES_PER_PLAN,
} from "../outcome-curriculum/contracts";
import { TOPIC_SCOPE_CONSULTANT_SYSTEM } from "../prompts/personas/topic-scope-consultant";

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
  - outcomes: the exact titles from the learner-confirmed bullet list, ${MIN_OUTCOMES_PER_PLAN}–${MAX_OUTCOMES_PER_PLAN} of them. Order them so the one they can start with nothing else in hand comes first. Never an activity ("timed practice"), never a chapter ("data structures"). Do not rename, merge, expand, or silently improve titles after confirmation.
  - startingPoint: { tier, reason } — the tier they settled on, and a reason paraphrasing something they actually said or tapped.
- createProject pauses for the learner to confirm with a button — do not announce it, do not ask permission in text, just call it. After it returns ok:true, write one short closing line.
- If it returns ok:false because more signal is needed, continue with one short question. For other failures, apologize briefly and ask if they want to retry.
- Never call createProject before the learner has confirmed the outcomes. If they edit the list, show the revised bullets and get confirmation of that exact list first.

Search policy:
- Search before proposing outcomes for any exam, credential, certification, or standard: its real published structure decides the split, and guessing it produces a curriculum that does not match the thing they are studying for.
- Do not guess when a quick search removes uncertainty.`;

export const TOPIC_ONBOARDING_CHAT_SYSTEM = `${TOPIC_SCOPE_CONSULTANT_SYSTEM}

${TOPIC_ONBOARDING_RUNTIME_NOTES}`;

/**
 * The topic consultant's handoff. It carries no learner brief: the ability
 * mode's brief steers a decomposition of who the learner is becoming, while
 * here the topic plus the confirmed outcome titles are the steering signal,
 * and the designer reads the transcript for everything else.
 */
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
    .array(z.string().min(1))
    .min(MIN_OUTCOMES_PER_PLAN)
    .max(MAX_OUTCOMES_PER_PLAN)
    .describe(
      "The confirmed pieces the learner's definition of mastery splits into, earliest-startable first. Each names something a task can DEMAND, never a study activity and never a chapter heading.",
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
}) satisfies z.ZodType<CreateProjectInput>;

type ProjectCreationReadiness =
  | { ready: true }
  | { ready: false; reason: string };

/**
 * Built per-request inside the chat stream so its `execute` closes over the
 * live progress writer and the session's persistence deps. Identical lifecycle
 * to the ability-mode tool — only the input shape differs.
 */
export const createCreateTopicProjectTool = ({
  buildProject,
  getReadiness,
}: {
  buildProject: (input: CreateProjectInput) => Promise<CreateProjectResult>;
  getReadiness?: () => ProjectCreationReadiness;
}) =>
  tool({
    description:
      "Provision the learner's project once they have explicitly confirmed the outcome split you proposed. Pauses for their confirmation, then builds and saves the full curriculum server-side.",
    inputSchema: CreateTopicProjectInputSchema,
    needsApproval: () => getReadiness?.().ready ?? true,
    execute: async (input): Promise<CreateProjectResult> => {
      const readiness = getReadiness?.();
      if (readiness && !readiness.ready) {
        return { ok: false, reason: readiness.reason };
      }
      return buildProject(input);
    },
  });
