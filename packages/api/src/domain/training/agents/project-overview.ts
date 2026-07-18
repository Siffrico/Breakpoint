import type {
  ArtifactResumeOptions,
  ContinuationConfig,
} from "../orchestration/agent-runtime";
import type {
  OnboardingPacket,
  OnboardingTranscript,
  ProjectOverviewOutput,
} from "./contracts";
import { runResilientAgent } from "../orchestration/agent-runtime";
import { ProjectOverviewOutputSchema } from "./contracts";

const PROJECT_OVERVIEW_SYSTEM = `You are Breakpoint's project-overview architect.

You turn the learner's onboarding context into a long-form, narrative mental map of the entire topic before the curriculum begins. This is not a syllabus. It is the field-level operating map that prevents the learner from feeling blind when connected concepts appear early.

Your design principle: build the learner's first compressed schema. Explain the field as a coherent system: why it exists, what problem it solves, what the major concepts are, why those concepts were invented, how they depend on each other, where beginners get confused, and how the learner's project will force the ideas to become real.

Quality bar:
- The overview should feel like a brilliant expert walking the learner through the whole territory with one sharp analogy that keeps expanding.
- Prefer intuitive definitions over textbook definitions. Define technical terms only after the learner can feel why the term exists.
- Build from first principles, then name the field's vocabulary. Never throw vocabulary first.
- Explain the "why" behind each major concept: what failure, limitation, pressure, or opportunity made the concept necessary.
- Make dependencies explicit. If concept B depends on concept A, say so plainly.
- Make beginner traps explicit. The learner should recognize common wrong mental models before they fall into them.
- Connect every major section to the learner's target identity, baseline, hard moments, and project spine when available.
- Be exhaustive where it matters, but keep the narrative clean. This should be long because it carries a lot, not because it rambles.

Length bar:
- The body should be a substantial long-form overview, normally 6,000 to 10,000 tokens when the topic is broad enough.
- Do not compress into a short memo. The learner asked for the high-level map that makes the whole topic feel navigable.
- If the domain is narrower, still cover the full dependency map, analogies, why-chain, vocabulary, misconception map, and project connection.

Output style:
- Markdown body.
- Use clear section headings.
- Use bullets, numbered lists, bold emphasis, tables, blockquotes, and code blocks when they make the map easier to scan.
- Use LaTeX math notation when a formula, ratio, system relation, or quantitative concept clarifies the topic.
- Use tables only when they clarify dependencies, misconceptions, or concept contrasts.
- Use one central analogy repeatedly and precisely. Do not use random unrelated analogies.
- Avoid motivational filler. The value is orientation, compression, and intuitive clarity.

Search policy:
- You have access to a web search tool. Use it whenever you are not 100% certain about a factual claim, named artifact, current state, API/tool detail, person, company, market, event, schedule, law, or anything that may have changed.
- Search before grounding the overview in external facts, field norms, tools, projects, or examples you have not verified.
- Do not guess when a quick search would remove uncertainty.`;

/**
 * The overview is the one build artifact with a long-form, append-able field
 * (the markdown `body`), so it supplies a continuation config: on a truncated
 * generation the runner seeds the captured partial and asks the model to finish
 * it, then merges the two bodies. Structured agents (packet, curriculum) have no
 * such config and fall back to a restart. See {@link runResilientAgent}.
 */
const OVERVIEW_CONTINUATION: ContinuationConfig<ProjectOverviewOutput> = {
  buildPrompt: (basePrompt, partial) =>
    buildContinuationPrompt({
      basePrompt,
      partialTitle: partial.title,
      partialSummary: partial.summary,
      partialBody: (partial.body ?? "").trim(),
    }),
  merge: (partial, output) => {
    const partialBody = partial.body ?? "";
    if (partialBody.length > output.body.length) {
      return { ...output, body: mergeOverviewBodies(partialBody, output.body) };
    }
    return output;
  },
};

export const designProjectOverview = async ({
  packet,
  transcript,
  options,
}: {
  packet: OnboardingPacket;
  transcript: OnboardingTranscript;
  options?: ArtifactResumeOptions<ProjectOverviewOutput>;
}): Promise<ProjectOverviewOutput> => {
  const basePrompt = `Create the learner's project overview.

This overview is generated once when the project is created, in parallel with the curriculum designer. Use the same onboarding context the curriculum designer receives, but do not output a curriculum. Output the mental map that makes the curriculum easier to keep up with.

Required body structure:

1. Start with the field in one plain-English sentence.
2. Explain why the field exists and what problem it is trying to solve.
3. Introduce one central analogy that can carry the whole topic.
4. Walk through the major concepts as parts of that analogy.
5. For each major concept, explain:
   - intuitive definition
   - why it was invented or why it matters
   - what it depends on
   - what it unlocks
   - the wrong beginner version of the idea
6. Explain the prerequisites the learner should understand and why each prerequisite matters.
7. Explain how the concepts connect into a dependency network, not a linear list.
8. Include a "five whys" style section for why this topic is hard.
9. Include a vocabulary map of terms the learner will hear early.
10. Include a misconception map that makes failure patterns recognizable.
11. Tie the whole overview back to the learner's desired project and target identity.
12. End with a compressed mental model the learner can carry into the first unit.

Packet:
${formatOnboardingPacket(packet)}

Transcript:
${formatOnboardingTranscript(transcript)}`;

  return runResilientAgent({
    agent: "projectOverview",
    system: PROJECT_OVERVIEW_SYSTEM,
    schema: ProjectOverviewOutputSchema,
    errorMessage: "Failed to generate the project overview.",
    prompt: basePrompt,
    continuation: OVERVIEW_CONTINUATION,
    onPartial: options?.onPartial,
    seedPartial: options?.seedPartial,
  });
};

const buildContinuationPrompt = ({
  basePrompt,
  partialTitle,
  partialSummary,
  partialBody,
}: {
  basePrompt: string;
  partialTitle?: string;
  partialSummary?: string;
  partialBody: string;
}) => `${basePrompt}

The previous response stopped before completing a schema-valid overview. Continue from exactly where it left off.

Return one complete JSON object matching the required schema:
- Reuse this title unless it is clearly incomplete: ${partialTitle ?? "(none)"}
- Reuse this summary unless it is clearly incomplete: ${partialSummary ?? "(none)"}
- For body, include the existing markdown below unchanged and then continue it naturally. Do not restart, summarize, or duplicate earlier sections.

Existing markdown body:
${partialBody}`;

const mergeOverviewBodies = (first: string, second: string) => {
  const trimmedFirst = first.trim();
  const trimmedSecond = second.trim();
  if (!trimmedFirst) return trimmedSecond;
  if (!trimmedSecond || trimmedSecond.startsWith(trimmedFirst)) {
    return trimmedSecond || trimmedFirst;
  }
  return `${trimmedFirst}\n\n${trimmedSecond}`;
};

const formatOnboardingPacket = (packet: OnboardingPacket): string =>
  `Target identity: ${packet.targetIdentity}
Motivation: ${packet.motivation}
Current baseline: ${packet.currentBaseline}
Hard moments: ${packet.hardMoments.join("; ") || "None provided"}
Constraints: ${packet.constraints.join("; ") || "None provided"}
Proof of progress: ${packet.proofOfProgress ?? "Not established"}
Identity friction: ${packet.identityFriction ?? "Not established"}
Behavior signals: ${packet.behaviorSignals.join("; ") || "None provided"}
Confidence flags: ${packet.confidenceFlags.join("; ") || "None provided"}`;

const formatOnboardingTranscript = (messages: OnboardingTranscript): string =>
  messages
    .map(
      (message) =>
        `${message.role.toUpperCase()}${message.slot ? ` [${message.slot}]` : ""}: ${message.content}`,
    )
    .join("\n");
