import { IdentityReportSchema } from "@acme/validators";

import type { IdentityReport, OnboardingTranscriptMessage } from "../types/becoming.types";
import { executePrompt } from "../engine";
import { formatOnboardingTranscript } from "../prompts/fragments";
import { identityReportPrompt } from "../prompts/legacy-registry";

export const buildIdentityReport = async (
  messages: OnboardingTranscriptMessage[],
): Promise<IdentityReport> =>
  executePrompt({
    template: identityReportPrompt,
    schema: IdentityReportSchema,
    context: {
      Transcript: formatOnboardingTranscript(messages),
    },
    errorMessage: "Failed to generate the identity report.",
  });
