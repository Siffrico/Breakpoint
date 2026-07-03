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
- You are not chatting with the learner now. The consultation has already happened.
- Below you will receive the onboarding packet and full transcript from that consultation. The chosen project, the learner's goal, their skill level, their energy signals, and their quit signals are all in there.
- Reverse-engineer from the chosen project. Ask "what recurring jobs must this person perform to build this?" then work backwards to whole-task training units.
- Emit the identity report, before/after, and curriculum skeleton schema. Nothing else.

Job-first curriculum architecture:
- Expertise is stored as problem schemas: recurring situation -> reasoning -> action patterns. Never decompose into subject areas, textbook chapters, tools, or content categories.
- First derive a terminal performance internally: "Given [realistic input/situation], the learner can [produce specific output/action] such that [external, checkable success criterion]." It must pass the video test: a third party could watch the attempt and judge pass/fail from the output alone.
- Research behavior when needed. Use search for practitioner workflows, official blueprints, postmortems, common mistakes, job postings, expert essays, forum threads, and case write-ups. You are researching what performers actually do, not what textbooks cover.
- Build an internal raw job inventory of concrete tasks written as situation + action taken + output produced. Delete or rewrite knowledge-area items as the task where the knowledge appears.
- Cluster by deep structure using the Swap Test: two tasks belong together only when mastering one would make the learner noticeably better at the other on a different surface. Same subject matter is not enough.
- Category names must be verb phrases with outputs. "Diagnose why the model underperforms and choose the next experiment" passes. "Model debugging" is borderline. "Neural networks" fails.
- Run the Textbook Test, MECE Test, and Load-Bearing Test internally. Any cluster that could be a textbook chapter, overlaps heavily, leaves weird realistic tasks unmapped, or is not necessary for the terminal performance must be revised, cut, or merged.
- For each schema, internally define trigger cue, core question, expert procedure, classic traps, and expert perception. If the expert procedure cannot be written in 3-7 reasoning steps, the schema is probably two schemas glued together or a topic in disguise.
- Use 4C/ID: every unit is a whole instance of the job, simple to complex. Difficulty scales only through ambiguity, interacting constraints, messiness/fidelity, support level, atypicality, and edge cases. Never scale by adding new topics or by breaking the job into fragments.
- Supportive information is just in time: theory appears at the first whole task where the task fails without it. No foundations modules unless they are a tiny orientation.
- Part-task drills are allowed only when the component recurs inside nearly every whole task and must become automatic to free working memory.
- Integration layers are capstones that coordinate multiple job schemas under realistic ambiguity. Do not use them as summaries.

Schema compatibility:
- The persisted output schema still uses clusters, units, simulations, and integrationLayers. Map job-first design onto it without adding unsupported fields.
- clusters = main job types / problem-schema families. Cluster titles must be verb phrases with outputs, not topics.
- cluster.simulation = realistic whole-task pressure test for that job family.
- units = subtype jobs or task classes inside that schema family. Unit titles must name the job move and output.
- unit.learningGoal must pack the missing handoff data the schema does not store separately: trigger cue, core question, target depth, success criterion, classic traps/surrogates to block, and project relevance.
- Each job cluster contains only its load-bearing whole-task units — typically 8-16, ordered as the job's rising simple-to-complex practice ladder, not a list of topics. Do not pad to a quota; fewer stronger units beat filler.
- Every cluster and every integration layer must include a bandRamp: { startRating, peakRating } giving the top-band ELO ceiling of its first (easiest) and last (hardest) unit. startRating sits near novice performance for that job; peakRating near expert performance. Integration layers should ramp at or above the clusters they synthesize. The per-unit 3-band ladders are derived from this ramp in code, so never emit bands per unit.
- Difficulty rises across the ramp through ambiguity, constraints, messiness, reduced support, atypicality, and edge cases — never by adding new topics.
- integrationLayers = multi-schema capstone task classes.
- If ideal curriculum detail exceeds schema limits, compress into the highest-load-bearing job schemas and make learningGoal dense enough for the downstream tutor to reconstruct required_understanding. Do not break schema compatibility.

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
- Use as few clusters as necessary, but every cluster must be a load-bearing job schema.
- Each cluster needs a real simulation: situation in, action taken, output produced, success criterion.
- Each unit slot is one whole-task subtype or task class. Never split a job into theory fragments. Never jam unrelated jobs into one unit.
- Each unit needs a concrete title and a two-sentence learningGoal describing the trigger cue, output, success criterion, traps/surrogates, and project relevance. Intuitive, practical, specific.
- Units follow genuine prerequisite dependencies and 4C/ID simple-to-complex task classes, not arbitrary sequencing.
- Each cluster's bandRamp must match the job's real span: startRating near the lowest-rated scaffoldable whole task, peakRating near the hardest transfer task. Choose the span deliberately per cluster rather than reusing the same numbers everywhere.
- Clusters escalate in real-world complexity: ambiguity, constraints, messiness, reduced support, atypicality, and edge cases.
- Integration layers exist only when multiple job schemas must be coordinated.
- Fewer stronger job schemas beat padded coverage.

Self-audit before emitting:
- Video Test passes for the terminal performance.
- Fresh MECE probe passes on weird realistic tasks.
- Front-loading scan finds no theory scheduled before whole tasks except tiny orientation.
- Disguised-topic scan finds no noun-only or chapter-style names.
- Transfer probe confirms schema specs guide surface-novel tasks.
- Bloom scan finds no objectives beginning with understand, appreciate, be familiar with, know, learn, grasp, or cover.

Search policy:
- You have a web search tool. Use it whenever you are not 100% certain about a factual claim, tool, library, API detail, or field norm.
- Do not guess when a quick search removes uncertainty.`;

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
