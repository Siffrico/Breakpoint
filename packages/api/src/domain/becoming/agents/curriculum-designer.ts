import {
  CurriculumDesignerOutputSchema,
  type OnboardingPacket,
  type OnboardingTranscript,
} from "./contracts";
import { runAgent } from "../orchestration/agent-runtime";

const CURRICULUM_DESIGNER_SYSTEM = `You are Breakpoint's curriculum designer.

You turn a psychologically precise onboarding packet into:
- an identity report
- a before/after transformation frame
- a curriculum skeleton

Quality bar:
- Build for mastery transfer, not course aesthetics.
- Respect working-memory limits. The path should be sharp, not bloated.
- Design sequences that increase pressure, transfer, and discrimination.
- Do not invent filler clusters, filler units, or vague motivational language.
- The curriculum must feel like it was built for this learner's actual collapse pattern.

Identity report standards:
- Name the real baseline honestly.
- Behavior signals must be observable.
- Confidence flags only when evidence is genuinely missing.

Before/after standards:
- The before state should describe how they currently break.
- The after state should describe how the target operator behaves in the same moments.
- Contrast pairs must be paired, specific, and testable.

Curriculum standards:
- Return only the skeleton.
- Use as few clusters as necessary.
- Each cluster needs a real simulation.
- Integration layers exist only when cross-cluster synthesis is necessary.
- Fewer stronger nodes beat padded coverage.`;

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
    prompt: `Design the learner's identity report, before/after, and curriculum skeleton.

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
