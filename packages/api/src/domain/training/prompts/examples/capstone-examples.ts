import type { FewShotExample } from "../types";

export const BUILD_CAPSTONE_EXAMPLES: FewShotExample[] = [
  {
    label: "Failing build — single skill only",
    score: 45,
    passed: false,
    input:
      "The learner produced a well-structured document that clearly applies one skill from the cluster but ignores the other two. The artifact meets the format constraints but doesn't demonstrate integration.",
    reasoning:
      "Skill integration: 20 — only one of three cluster skills is present. Criteria satisfaction: 55 — format constraints met, but evaluation criteria requiring integration are unaddressed. Depth and rigor: 60 — the one skill applied shows competent understanding. The capstone bar requires integration, and this artifact doesn't demonstrate it. Revision guidance: incorporate [skill 2] into the analysis section and use [skill 3] to evaluate the tradeoffs.",
  },
  {
    label: "Passing build — integrated with minor gaps",
    score: 76,
    passed: true,
    input:
      "The learner produced an artifact that applies all three cluster skills. The integration between skills 1 and 2 is strong, but the connection to skill 3 feels tacked on rather than organic. All constraints are met.",
    reasoning:
      "Skill integration: 70 — all three skills present, but skill 3 integration is superficial. Criteria satisfaction: 80 — all criteria addressed, though the skill 3 integration could be deeper. Depth and rigor: 78 — shows genuine understanding in the areas where integration is strong. Passes the capstone bar but the weak point is clear.",
  },
];

export const DEBATE_CAPSTONE_EXAMPLES: FewShotExample[] = [
  {
    label: "Failing debate — generic rhetoric",
    score: 50,
    passed: false,
    input:
      "The learner defended their position eloquently across all three rounds, but their arguments relied on general logical reasoning and persuasion techniques rather than the cluster's specific concepts. They never referenced the principles taught in the cluster.",
    reasoning:
      "Concept application: 20 — no cluster-specific principles used in any round. Consistency under pressure: 75 — maintained position throughout. Judgment quality: 65 — made reasonable arguments, just not using the right tools. The capstone tests whether the learner can apply the cluster's principles under pressure, not general debate skill.",
  },
  {
    label: "Passing debate — cluster principles under pressure",
    score: 82,
    passed: true,
    input:
      "The learner defended using two of the three cluster concepts explicitly in rounds 1 and 2. In round 3, they acknowledged the edge case was partially valid but argued from the cluster's framework why the position still holds. They used a specific example that demonstrated the principle in action.",
    reasoning:
      "Concept application: 80 — explicitly used cluster concepts in defense, though one was underrepresented. Consistency under pressure: 85 — maintained position while honestly engaging with the strongest objection. Judgment quality: 80 — acknowledged valid points without abandoning the core position.",
  },
];
