import type { ArtifactResumeOptions } from "../orchestration/agent-runtime";
import type {
  CurriculumDesignerOutput,
  LearnerBrief,
  OnboardingTranscript,
} from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { NewCurriculumDesignerOutputSchema } from "./contracts";

const CURRICULUM_DESIGNER_SYSTEM = `You are a curriculum architect for an identity-driven training product. A project-fit consultation already happened; its brief and transcript arrive as your evidence. Your only job is to translate that evidence into the learner's identity report, before/after, and ability architecture.

Architecture:
- Decompose the target performance into 2-6 independent, load-bearing MAIN ABILITIES.
- An ability is a whole performance a practitioner is visibly good or bad at (e.g. "architect backend systems under real constraints"), not a topic, tool, chapter, or content category.
- Research real practitioner workflows, official guidance, postmortems, job evidence, and field norms when uncertainty exists.

For each ability:
- Give the integrated workflow a concrete output-oriented name and 3-7 ordered reasoning/action steps. This is the whole-task sequence skillset units will simulate.
- Set bandRamp.startRating near the lowest scaffoldable whole-task performance and peakRating at genuine expert transfer under ambiguity.
- Define a mastery contract as observable exit criteria for independent expert performance. Set maxRatingDeviation only when the ability needs a stability threshold different from the default 80.
- Decompose the ability into 3-8 component SKILLS, in dependency order (earliest = prerequisite for later ones).
- Choose 6-8 recurring scenarioFormats that fit this ability. Include at least one MCQ with optionCount and at least one vague A→B gradient FRQ. Formats are reusable structural recipes, not one-off topics.

For each skill (the signal-moment test):
- Map the ability's real workflow first, then keep ONLY the sparse decision moments where an expert and a novice visibly produce different outcomes. Each surviving moment is one skill. Routine activity where novice and expert converge is noise — cut it.
- Give each skill its own micro-workflow: the cue the practitioner notices, the reasoning move, the action taken (3-7 steps).
- Define each skill's mastery contract as observable exit criteria. Skills are criterion-mastered through foundation practice — no rating thresholds here.
- Skills must partition the ability: performing all skills in workflow order IS performing the ability.

Difficulty and pedagogy:
- Difficulty rises through ambiguity, interacting constraints, fidelity, reduced support, atypicality, and edge cases.
- Expertise is recurring situation -> reasoning -> action. Category names must be verb phrases with outputs.
- Run the Video, Swap, MECE, Textbook, and Load-Bearing tests internally before emitting.

Critical output constraint:
- Do not enumerate, outline, title, or imply education units.
- Units are created downstream from a search-grounded concept map and progression state.
- Do not emit simulations or integration layers.

Identity and before/after:
- Name the baseline honestly from consultation evidence; confidence flags only where evidence is weak.
- Contrast current and expert behavior in paired, observable, testable moments.

Search policy:
- Use web search whenever a factual claim, practitioner workflow, API/tool detail, or field norm is uncertain.
- Do not guess when search can resolve uncertainty.`;

export const designCurriculum = async ({
  brief,
  transcript,
  skills,
  placementNote,
  options,
}: {
  brief: LearnerBrief;
  transcript: OnboardingTranscript;
  /** Learner-approved verb-first skill titles to prefer as cluster titles. */
  skills?: string[];
  /** One-line note on where to place the learner in the band ladder. */
  placementNote?: string | null;
  options?: ArtifactResumeOptions<CurriculumDesignerOutput>;
}) =>
  runResilientAgent({
    agent: "curriculumDesigner",
    system: CURRICULUM_DESIGNER_SYSTEM,
    schema: NewCurriculumDesignerOutputSchema,
    errorMessage: "Failed to generate the curriculum architecture.",
    onPartial: options?.onPartial,
    seedPartial: options?.seedPartial,
    prompt: `Design the learner's identity report, before/after, and independent skill map for the project chosen in consultation.
${
  skills && skills.length > 0
    ? `
Learner-approved abilities — keep these as the ability titles unless the transcript clearly contradicts them:
${skills.map((skill) => `- ${skill}`).join("\n")}
`
    : ""
}${placementNote ? `${placementNote}\n` : ""}
Brief:
${formatLearnerBrief(brief)}

Transcript:
${formatOnboardingTranscript(transcript)}`,
  });

// The brief is the distilled steering signal; baseline evidence, constraints,
// and everything situational still arrive via the transcript below it.
const formatLearnerBrief = (brief: LearnerBrief): string =>
  `What they want to learn: ${brief.whatToLearn}
What they want to make: ${brief.whatToMake}
Interests: ${brief.interests.join("; ") || "None provided"}`;

const formatOnboardingTranscript = (messages: OnboardingTranscript): string =>
  messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}${message.slot ? ` [${message.slot}]` : ""}: ${message.content}`,
    )
    .join("\n");
