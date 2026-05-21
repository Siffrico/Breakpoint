import type { FewShotExample } from "../types";

export const TEACHBACK_EXAMPLES: FewShotExample[] = [
  {
    label: "Weak — restated but couldn't defend",
    score: 40,
    passed: false,
    input:
      "The learner explained the concept by reading back the definition from the build content. When challenged with 'But doesn't that contradict X?', they said 'Yeah, I guess you're right, I hadn't thought of that.' They never generated an original example.",
    reasoning:
      "Conceptual accuracy: 50 — they restated correctly but showed no independent understanding. Defense quality: 15 — folded immediately on first objection without attempting to defend. Example usage: 10 — no examples generated at all. Depth progression: 20 — no visible improvement across rounds; each response was shorter and less confident. Weighted: (50*0.25 + 15*0.30 + 10*0.20 + 20*0.25) = 12.5 + 4.5 + 2 + 5 = 24, but adjusting for partial credit on restatement quality, ~40.",
  },
  {
    label: "Borderline — defended some points but cracked",
    score: 65,
    passed: false,
    input:
      "The learner gave a solid initial explanation with one relevant example from their own experience. When challenged on round 2 with a structural objection, they partially defended but conceded the key point. In round 3, they tried to recover but their explanation became circular.",
    reasoning:
      "Conceptual accuracy: 75 — good initial explanation with minor gaps. Defense quality: 50 — defended round 1 well but conceded the key structural point in round 2 without fighting for it. Example usage: 70 — one strong personal example, but didn't generate new ones under pressure. Depth progression: 45 — showed slight deepening in round 1 but regressed to circular reasoning by round 3. The concession on the structural point without attempting defense is the key failure.",
  },
  {
    label: "Passing — handled pressure with minor gaps",
    score: 78,
    passed: true,
    input:
      "The learner explained the concept clearly and defended against round 1 and 2 objections with reasoning. They generated two concrete examples. In round 3, they acknowledged the edge case was valid but argued why it didn't undermine the core principle, though their argument was somewhat thin.",
    reasoning:
      "Conceptual accuracy: 85 — accurate explanation with clear grasp of the core principle. Defense quality: 75 — strong defense on first two rounds, acknowledged the edge case honestly in round 3 and made a reasonable (if thin) argument for why the principle holds. Example usage: 80 — two concrete examples, both relevant and neither from the build content. Depth progression: 70 — visible deepening through round 2, slight flattening in round 3 but maintained coherence.",
  },
  {
    label: "Strong — generated novel insight under pressure",
    score: 92,
    passed: true,
    input:
      "The learner's initial explanation was precise and used a novel analogy not from the build content. When challenged, they defended each point with specific reasoning and generated a new example in round 2 that actually strengthened their position. In round 3, they identified that the edge case actually proved a deeper version of the principle.",
    reasoning:
      "Conceptual accuracy: 95 — precise and demonstrated independent understanding. Defense quality: 90 — every objection was met with specific reasoning, not just restatement. Example usage: 95 — novel analogy and a mid-debate example that strengthened the position. Depth progression: 90 — the round 3 response demonstrated deeper understanding than round 1, turning the edge case into evidence for the principle.",
  },
];

export const FAILURE_ISOLATION_EXAMPLES: FewShotExample[] = [
  {
    label: "Surface-level abstraction identified",
    score: 0,
    passed: false,
    input:
      "Practice round 2 (construction): The learner was asked to design a feedback system using the principle. They wrote a system that restates the principle in its description but doesn't actually apply it in the mechanism. Teach-back round 2: When asked 'How would your system handle X edge case?', they restated the principle definition instead of applying it.",
    reasoning:
      "The learner can restate the concept accurately but cannot apply it to generate new structures. Both the construction task and the teach-back challenge exposed the same pattern: confident restatement followed by inability to operationalize. This is surface-level-abstraction — they hold the label but not the operational model. The gap became most visible in practice round 2 when the construction output didn't actually use the principle despite naming it.",
  },
  {
    label: "False concession identified",
    score: 0,
    passed: false,
    input:
      "Teach-back round 1: Learner gave a strong opening explanation. Round 2: When challenged with 'But couldn't you achieve the same result with a simpler approach?', the learner said 'That's a great point, you're right, the simpler approach would probably work.' Round 3: The learner then tried to argue the principle still matters but couldn't explain why after having conceded.",
    reasoning:
      "The learner understood the concept initially but lacks the conviction to defend it under social pressure. They conceded a point that was defensible because the objection sounded reasonable, not because it was actually correct. This is false-concession — agreeing with objections too quickly without testing whether the objection actually holds. The gap became visible at teach-back round 2, the exact moment they said 'you're right' without checking whether that was true.",
  },
];
