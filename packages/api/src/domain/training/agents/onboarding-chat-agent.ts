import { tool } from "ai";
import { z } from "zod/v4";

import type { CreateProjectInput } from "../orchestration/build-project";
import { PROJECT_FIT_CONSULTANT_SYSTEM } from "../prompts/personas/project-fit-consultant";

const ONBOARDING_RUNTIME_NOTES = `Runtime notes for this session:
- The learner has already been shown the opener "Who do you want to become?" — their first message is the answer. Continue the consultation from step 2 onward; do not re-ask the opener.
- Run the full 9-step consultation. Do not skip steps. Do not collapse multiple questions into one turn.
- Only once the learner has explicitly chosen one of the 2–4 projects you suggested (step 9): call the createProject tool.
  - projectName: the core study topic only, lowercase — e.g. "computer engineering", "machine learning". Not the project name, not an identity phrase, not a sentence.
  - targetIdentity: one short phrase for who they are becoming.
  - summary: one line describing what they will build.
- createProject pauses for the learner to confirm with a button — do not announce it, do not ask permission in text, just call it. After it returns ok:true, write one short closing line. Do not repeat or restate the plan.
- If it returns ok:false because more learner signal is needed, continue the consultation with one short question. For other failures, apologize briefly and ask if they want to retry.
- Never call createProject before a project has been explicitly chosen.

Search policy:
- Search before suggesting projects around tools, libraries, papers, field norms, or any factual claim you have not verified.
- Do not guess when a quick search removes uncertainty.`;

export const ONBOARDING_CHAT_SYSTEM = `${PROJECT_FIT_CONSULTANT_SYSTEM}

${ONBOARDING_RUNTIME_NOTES}`;

/**
 * The consultant proposes only this small payload. The curriculum, overview,
 * identity profile, and persistence are all derived server-side from the
 * transcript — see `buildProjectFromOnboarding`.
 */
export const CreateProjectInputSchema = z.object({
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
}) satisfies z.ZodType<CreateProjectInput>;

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
