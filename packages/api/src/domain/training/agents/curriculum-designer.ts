import type { ArtifactResumeOptions } from "../orchestration/agent-runtime";
import type {
  CurriculumDesignerOutput,
  OnboardingPacket,
  OnboardingTranscript,
} from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { PROJECT_FIT_CONSULTANT_SYSTEM } from "../prompts/personas/project-fit-consultant";
import { CurriculumDesignerOutputSchema } from "./contracts";

const CURRICULUM_DESIGNER_TRANSLATOR = `Translator mode:
- The consultation is complete. Produce the identity report, before/after, and curriculum skill architecture only.
- Decompose the target performance into 3-6 independent, load-bearing main skills.
- Each skill is one workflow a practitioner repeatedly runs, not a topic, tool, chapter, or content category.
- Research real practitioner workflows, official guidance, postmortems, job evidence, and field norms when uncertainty exists.

For each skill:
- Give the workflow a concrete output-oriented name and 3-7 ordered reasoning/action steps.
- Set bandRamp.startRating near the lowest scaffoldable whole-task performance and peakRating at genuine expert transfer under ambiguity.
- Define a realistic simulation with a situation, required action/output, and externally checkable stakes.
- Define a mastery contract as observable exit criteria for independent expert performance.
- Keep skills independent: mastering one must not require completing another skill's authored sequence first.

Difficulty and pedagogy:
- Difficulty rises through ambiguity, interacting constraints, fidelity, reduced support, atypicality, and edge cases.
- Expertise is recurring situation -> reasoning -> action. Category names must be verb phrases with outputs.
- Supportive information is introduced just in time inside whole-task practice.
- Run the Video, Swap, MECE, Textbook, and Load-Bearing tests internally before emitting.

Critical output constraint:
- Do not enumerate, outline, title, or imply education units.
- Units are minted downstream from a search-grounded syllabus and current Goldilocks difficulty state.
- Do not emit integration layers. Cross-skill integration belongs in later orchestration, not this skill map.

Identity and before/after:
- Name the baseline honestly from consultation evidence; confidence flags only where evidence is weak.
- Contrast current and expert behavior in paired, observable, testable moments.

Search policy:
- Use web search whenever a factual claim, practitioner workflow, API/tool detail, or field norm is uncertain.
- Do not guess when search can resolve uncertainty.`;

const CURRICULUM_DESIGNER_SYSTEM = `${PROJECT_FIT_CONSULTANT_SYSTEM}

${CURRICULUM_DESIGNER_TRANSLATOR}`;

export const designCurriculum = async ({
  packet,
  transcript,
  options,
}: {
  packet: OnboardingPacket;
  transcript: OnboardingTranscript;
  options?: ArtifactResumeOptions<CurriculumDesignerOutput>;
}) =>
  runResilientAgent({
    agent: "curriculumDesigner",
    system: CURRICULUM_DESIGNER_SYSTEM,
    schema: CurriculumDesignerOutputSchema,
    errorMessage: "Failed to generate the curriculum architecture.",
    onPartial: options?.onPartial,
    seedPartial: options?.seedPartial,
    prompt: `Design the learner's identity report, before/after, and independent skill map for the project chosen in consultation.

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
