import { generateObject } from "ai";

import { BeforeAfterProfileSchema } from "@acme/validators";

import type {
  BeforeAfterProfile,
  IdentityReport,
} from "../types/becoming.types";
import { getBecomingModel } from "./becoming-model";

export const buildBeforeAfterProfile = async (
  report: IdentityReport,
): Promise<BeforeAfterProfile> => {
  const model = getBecomingModel();
  if (!model) {
    throw new Error(
      "OPENAI_API_KEY is required for AI-generated transformation reveals.",
    );
  }

  const { object } = await generateObject({
    model,
    schema: BeforeAfterProfileSchema,
    system:
      "You create sharp before-and-after transformation reveals for an identity-driven training product. Make the contrast feel specific, credible, and unsentimental. The output should feel diagnostic, not motivational.",
    prompt: `Build a before-and-after transformation reveal for this learner.

Requirements:
- headline should be a concise line about the shift underway.
- beforeSummary should describe how they operate now when the system breaks.
- afterSummary should describe how the target identity operates in the same kinds of moments.
- contrastPairs should be paired contrasts, not generic traits.
- firstShift should name the first concrete internal or behavioral shift the learner needs to make.
- Keep the language tight and specific.
- Do not invent life history.

Identity report:
Target identity: ${report.targetIdentity}
Headline: ${report.headline}
Motivation: ${report.motivation}
Current baseline: ${report.currentBaseline}
Proof of progress: ${report.proofOfProgress}
Hard moments: ${report.hardMoments.join("; ")}
Constraints: ${report.constraints.join("; ") || "None provided"}
Behavior signals: ${report.behaviorSignals.join("; ")}
Confidence flags: ${report.confidenceFlags.join("; ") || "None provided"}`,
  });

  return object;
};
