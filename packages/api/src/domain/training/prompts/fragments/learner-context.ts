import type { IdentityReport } from "../../types/training.types";

export const formatIdentityReport = (report: IdentityReport): string =>
  `Target identity: ${report.targetIdentity}
Headline: ${report.headline}
Motivation: ${report.motivation}
Current baseline: ${report.currentBaseline}
Proof of progress: ${report.proofOfProgress}
Hard moments: ${report.hardMoments.join("; ")}
Constraints: ${report.constraints.join("; ") || "None provided"}
Quality standards: ${report.qualityStandards.join("; ") || "None provided"}
Behavior signals: ${report.behaviorSignals.join("; ")}
Confidence flags: ${report.confidenceFlags.join("; ") || "None provided"}`;
