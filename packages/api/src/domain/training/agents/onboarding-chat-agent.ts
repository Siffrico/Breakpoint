import { tool } from "ai";
import { z } from "zod/v4";

import { StartingPointTierSchema } from "@acme/validators";

import type { CreateProjectInput } from "../orchestration/build-project";
import { PROJECT_FIT_CONSULTANT_SYSTEM } from "../prompts/personas/project-fit-consultant";
import { LearnerBriefSchema } from "./contracts";

const ONBOARDING_RUNTIME_NOTES = `Runtime notes for this session:
- The learner has already been shown the opener "What's something you've seen someone build or do that made you think: I want to be able to do that?" — their first message is the answer. Continue from there; do not re-ask the opener and do not paraphrase their answer back at them as a question.
- Follow the interview mechanics: run the reasoning loop before every question, one question per turn, a mirror at least every three questions, stop as soon as you know all five, readback before projects. The 15-question ceiling covers this whole session.
- The FUEL slot: once you know the field, use one discovery turn to ask for up to three concrete sources of fascination in that world: companies, products, projects, creators, or systems they genuinely follow. Ask for names plus the specific thing about them that holds the learner's attention. This is scenario fuel, not small talk; do not accept only broad labels such as "AI companies" or "good design."
- Call the askStartingPoint tool exactly once, after you know the field they want but before you suggest any projects.
  - question: one short sentence asking where they are in THAT field right now, in their own domain language.
  - options: 3–4 concrete behavioral facts they can tap, each a real thing a learner in this field has or hasn't done ("I've deployed models to production", "I've trained models but never shipped one"). Each option carries a tier: fundamentals | skip_basics | advanced. Never use level words ("beginner/intermediate/advanced") in an option label, and never say "band".
  - If the learner types their answer in prose instead of tapping, accept it — infer the tier yourself and continue. Never re-ask the question.
  - After the answer arrives, acknowledge in at most one short sentence ("Skipping the basics, then.") and move on.
- Only once the learner has explicitly chosen one of the 2–4 projects you suggested: call the createProject tool.
  - whatToLearn, whatToMake, interests: the brief. You ran the interview, so write these from what the learner actually told you, in their words. Everything the curriculum and overview agents build is steered by these three fields, so they carry the weight of the whole consultation.
    - whatToLearn: the field plus the specific flavor of it they care about, never a bare topic label.
    - whatToMake: the concrete thing they chose to build.
    - interests: what turns them alive. Each entry stands alone: a named company, product, project, or creator plus the specific quality that grips them, or a driver you excavated and they confirmed in a mirror. Never a broad label.
  - projectName: the core study topic only, lowercase — e.g. "computer engineering", "machine learning". Not the project name, not an identity phrase, not a sentence.
  - targetIdentity: one short phrase for who they are becoming.
  - summary: one line describing what they will build.
  - skills: 3–6 verb-first capability titles the curriculum will teach, 3–5 words each ("Architect Distributed Backend Systems"). Real load-bearing skills for this field, not topics or tools.
  - startingPoint: { tier, reason } — the tier the learner settled on, and a reason that paraphrases something they actually said or tapped ("you said you've deployed models to production").
- createProject pauses for the learner to confirm with a button — do not announce it, do not ask permission in text, just call it. After it returns ok:true, write one short closing line. Do not repeat or restate the plan.
- If it returns ok:false because more learner signal is needed, continue the consultation with one short question. For other failures, apologize briefly and ask if they want to retry.
- Never call createProject before a project has been explicitly chosen.
- Before suggesting projects, the transcript must contain at least one named source of fascination and the specific quality the learner finds interesting. If it does not, ask that one question next.

Search policy:
- Search before suggesting projects around tools, libraries, papers, field norms, or any factual claim you have not verified.
- Do not guess when a quick search removes uncertainty.`;

export const ONBOARDING_CHAT_SYSTEM = `${PROJECT_FIT_CONSULTANT_SYSTEM}

${ONBOARDING_RUNTIME_NOTES}`;

/**
 * The consultant's handoff. It carries the learner brief (see
 * {@link LearnerBriefSchema}) because the consultant just ran the interview and
 * knows these answers first-hand; the curriculum, overview, identity profile,
 * and persistence are all still derived server-side from the brief plus the
 * transcript — see `buildProjectFromOnboarding`.
 */
export const CreateProjectInputSchema = LearnerBriefSchema.extend({
  projectName: z
    .string()
    .min(1)
    .describe(
      'The saved project/sidebar name as the core study topic only, for example "computer engineering" or "machine learning". Do not use an identity phrase, sentence, or long descriptive title.',
    ),
  targetIdentity: z
    .string()
    .min(1)
    .describe("One short phrase for who the learner is becoming."),
  summary: z
    .string()
    .min(1)
    .describe("One line describing what the learner will build."),
  skills: z
    .array(z.string().min(1))
    .min(3)
    .max(6)
    .describe(
      'The 3–6 load-bearing skills the curriculum will teach, as verb-first capability titles of 3–5 words each, for example "Architect Distributed Backend Systems". Not topics, tools, or chapters.',
    ),
  startingPoint: z
    .object({
      tier: StartingPointTierSchema,
      reason: z
        .string()
        .min(1)
        .describe(
          "A short reason that paraphrases something the learner actually said or tapped, e.g. 'you said you've deployed models to production'.",
        ),
    })
    .describe(
      "Where the learner is starting from, settled during the consultation (usually via askStartingPoint).",
    ),
}) satisfies z.ZodType<CreateProjectInput>;

/**
 * Client-side elicitation tool. It has NO `execute`, so the SDK forwards the
 * tool call to the client and pauses the run until the client supplies the
 * result via `addToolResult`. The learner taps one concrete behavioral option
 * (or types an answer, which the model interprets instead) and the tier rides
 * the tool result back into the transcript. See `starting-point-check.tsx`.
 */
export const AskStartingPointInputSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      "One short question asking where the learner is in their chosen field right now, in their own domain language.",
    ),
  options: z
    .array(
      z.object({
        label: z
          .string()
          .min(1)
          .describe(
            "A concrete behavioral fact the learner can tap, never a level word.",
          ),
        tier: StartingPointTierSchema,
      }),
    )
    .min(3)
    .max(4),
});

export const AskStartingPointOutputSchema = z.object({
  tier: StartingPointTierSchema,
  label: z.string().min(1),
});

export const askStartingPointTool = tool({
  description:
    "Ask the learner where they are starting from in their chosen field, once, before suggesting projects. The learner taps one concrete option; the chosen tier rides the result back. Do not announce it in text — just call it.",
  inputSchema: AskStartingPointInputSchema,
  outputSchema: AskStartingPointOutputSchema,
});

export type CreateProjectResult =
  | {
      ok: true;
      sessionId: string;
      planId: string;
      title: string;
      moduleCount: number;
      firstUnitId: string | null;
    }
  | { ok: false; reason: string };

type ProjectCreationReadiness =
  | { ready: true }
  | { ready: false; reason: string };

export const normalizeLearningTrackName = (input: string): string => {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized || "learning-track";
};

/**
 * Built per-request inside the chat stream so its `execute` closes over the
 * live progress writer and the session's persistence deps. `needsApproval`
 * makes the SDK surface an `approval-requested` part (the "Create project"
 * button) and only run `execute` after the learner confirms.
 */
export const createCreateProjectTool = ({
  buildProject,
  getReadiness,
}: {
  buildProject: (input: CreateProjectInput) => Promise<CreateProjectResult>;
  getReadiness?: () => ProjectCreationReadiness;
}) =>
  tool({
    description:
      "Provision the learner's project once they have explicitly chosen one of the options you proposed. Pauses for their confirmation, then builds and saves the full curriculum and overview server-side.",
    inputSchema: CreateProjectInputSchema,
    needsApproval: () => getReadiness?.().ready ?? true,
    execute: async (input): Promise<CreateProjectResult> => {
      const readiness = getReadiness?.();
      if (readiness && !readiness.ready) {
        return { ok: false, reason: readiness.reason };
      }

      return buildProject(input);
    },
  });
