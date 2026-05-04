import { BeforeAfterProfileSchema } from "@acme/validators";

import type { BeforeAfterProfile, IdentityReport } from "../types/becoming.types";
import { executePrompt } from "../engine";
import { formatIdentityReport } from "../prompts/fragments";
import { beforeAfterPrompt } from "../prompts/legacy-registry";

export const buildBeforeAfterProfile = async (
  report: IdentityReport,
): Promise<BeforeAfterProfile> =>
  executePrompt({
    template: beforeAfterPrompt,
    schema: BeforeAfterProfileSchema,
    context: {
      "Identity report": formatIdentityReport(report),
    },
    errorMessage: "Failed to generate the before-after profile.",
  });
