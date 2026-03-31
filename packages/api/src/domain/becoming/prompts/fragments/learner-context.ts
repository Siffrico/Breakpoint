import type { IdentityReport } from "../../types/becoming.types";

export const formatIdentityReport = (report: IdentityReport): string =>
  `Target identity: ${report.targetIdentity}
Headline: ${report.headline}
Motivation: ${report.motivation}
Current baseline: ${report.currentBaseline}
Proof of progress: ${report.proofOfProgress}
Hard moments: ${report.hardMoments.join("; ")}
Constraints: ${report.constraints.join("; ") || "None provided"}
Behavior signals: ${report.behaviorSignals.join("; ")}
Confidence flags: ${report.confidenceFlags.join("; ") || "None provided"}`;

export const formatBeforeAfter = (ba: {
  headline: string;
  beforeSummary: string;
  afterSummary: string;
  contrastPairs: Array<{ before: string; after: string }>;
  firstShift: string;
}): string =>
  `Headline: ${ba.headline}
Before summary: ${ba.beforeSummary}
After summary: ${ba.afterSummary}
Contrast pairs: ${ba.contrastPairs.map((p) => `${p.before} -> ${p.after}`).join("; ")}
First shift: ${ba.firstShift}`;
