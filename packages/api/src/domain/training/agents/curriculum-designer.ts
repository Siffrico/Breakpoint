import type { OnboardingPacket, OnboardingTranscript } from "./contracts";

import { CurriculumDesignerOutputSchema } from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";
import { PROJECT_FIT_CONSULTANT_SYSTEM } from "../prompts/personas/project-fit-consultant";

const CURRICULUM_DESIGNER_TRANSLATOR = `Translator mode:
- You are not chatting with the learner now. The consultation has already happened.
- Below you will receive the onboarding packet and full transcript from that consultation. The chosen project, the learner's goal, their skill level, their energy signals, and their quit signals are all in there.
- Reverse-engineer from the chosen project. Ask "what must this person be able to DO to build this?" then work backwards to the atomic skills.
- Emit the identity report, before/after, and curriculum skeleton schema. Nothing else.

Quality bar:
- Build for mastery transfer, not course aesthetics. The path should be sharp, not bloated.
- Design sequences that increase pressure, transfer, and discrimination.
- Do not invent filler clusters, filler units, or vague motivational language.
- The curriculum must feel like it was built for this specific learner and their specific chosen project.

Identity report standards:
- Name the real baseline honestly, using what the consultation surfaced.
- Behavior signals must be observable.
- Confidence flags only when evidence is genuinely missing.

Before/after standards:
- Before: how they currently break, in their own words from the transcript.
- After: how the operator who can build the chosen project behaves in the same moments.
- Contrast pairs must be paired, specific, and testable.

Curriculum standards:
- Return only the skeleton.
- Use as few clusters as necessary.
- Each cluster needs a real simulation.
- Each unit slot is one atomic topic — complete, self-contained, stands on its own. Never split a coherent topic. Never jam unrelated concepts into one unit.
- Each unit needs a concrete title and a two-sentence learningGoal describing what the learner can use after the unit. Intuitive, practical, specific.
- Units follow genuine prerequisite dependencies, not arbitrary sequencing.
- Clusters escalate in procedural complexity: early units isolate sub-skills, later units combine them.
- Integration layers exist only when cross-cluster synthesis is necessary.
- Fewer stronger nodes beat padded coverage.

Search policy:
- You have a web search tool. Use it whenever you are not 100% certain about a factual claim, tool, library, API detail, or field norm.
- Do not guess when a quick search removes uncertainty.`;

const CURRICULUM_DESIGNER_SYSTEM = `${PROJECT_FIT_CONSULTANT_SYSTEM}

${CURRICULUM_DESIGNER_TRANSLATOR}`;

export const designCurriculum = async ({
  packet,
  transcript,
}: {
  packet: OnboardingPacket;
  transcript: OnboardingTranscript;
}) =>
  runAgent({
    agent: "curriculumDesigner",
    system: CURRICULUM_DESIGNER_SYSTEM,
    schema: CurriculumDesignerOutputSchema,
    errorMessage: "Failed to generate the curriculum architecture.",
    reasoning: true,
    prompt: `Design the learner's identity report, before/after, and curriculum skeleton for the project they chose in the consultation.

Packet:
${formatOnboardingPacket(packet)}

Transcript:
${formatOnboardingTranscript(transcript)}`,
  });

const formatOnboardingPacket = (packet: OnboardingPacket): string =>
  `Target identity: ${packet.targetIdentity}
Motivation: ${packet.motivation}
Current baseline: ${packet.currentBaseline}
Hard moments: ${packet.hardMoments.join("; ")}
Constraints: ${packet.constraints.join("; ") || "None provided"}
Proof of progress: ${packet.proofOfProgress}
Identity friction: ${packet.identityFriction}
Behavior signals: ${packet.behaviorSignals.join("; ")}
Confidence flags: ${packet.confidenceFlags.join("; ") || "None provided"}`;

const formatOnboardingTranscript = (messages: OnboardingTranscript): string =>
  messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}${message.slot ? ` [${message.slot}]` : ""}: ${message.content}`,
    )
    .join("\n");
