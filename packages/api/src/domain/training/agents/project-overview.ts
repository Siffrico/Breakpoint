import { NoObjectGeneratedError, Output, stepCountIs, streamText } from "ai";

import type { OnboardingPacket, OnboardingTranscript } from "./contracts";
import {
  getSearchToolsForSelectedProvider,
  requireAiModelForPurpose,
} from "../engine/model-router";
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

const MAX_EMPTY_RESPONSE_RETRIES = 2;
const MAX_CONTINUATION_ATTEMPTS = 2;

export const designProjectOverview = async ({
  packet,
  transcript,
}: {
  packet: OnboardingPacket;
  transcript: OnboardingTranscript;
}) => {
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

  let partial: { title?: string; summary?: string; body?: string } = {};
  let emptyResponseRetries = 0;
  let continuationAttempts = 0;
  let prompt = basePrompt;

  while (true) {
    try {
      const output = await runProjectOverviewPrompt({
        prompt,
        onPartial: (nextPartial) => {
          partial = {
            title:
              typeof nextPartial.title === "string"
                ? nextPartial.title
                : partial.title,
            summary:
              typeof nextPartial.summary === "string"
                ? nextPartial.summary
                : partial.summary,
            body:
              typeof nextPartial.body === "string"
                ? nextPartial.body
                : partial.body,
          };
        },
      });

      if (partial.body && partial.body.length > output.body.length) {
        return {
          ...output,
          body: mergeOverviewBodies(partial.body, output.body),
        };
      }

      return output;
    } catch (error) {
      const generatedText = NoObjectGeneratedError.isInstance(error)
        ? error.text
        : null;
      const partialBody = partial.body?.trim() ?? "";
      const hasPartialResponse =
        partialBody.length > 0 || Boolean(generatedText?.trim());

      if (
        !hasPartialResponse &&
        emptyResponseRetries < MAX_EMPTY_RESPONSE_RETRIES
      ) {
        emptyResponseRetries += 1;
        continue;
      }

      if (
        partialBody.length > 0 &&
        continuationAttempts < MAX_CONTINUATION_ATTEMPTS
      ) {
        continuationAttempts += 1;
        prompt = buildContinuationPrompt({
          basePrompt,
          partialTitle: partial.title,
          partialSummary: partial.summary,
          partialBody,
        });
        continue;
      }

      throw new Error(
        error instanceof Error && error.message
          ? `Failed to generate the project overview. ${error.message}`
          : "Failed to generate the project overview.",
      );
    }
  }
};

const runProjectOverviewPrompt = async ({
  prompt,
  onPartial,
}: {
  prompt: string;
  onPartial: (partial: {
    title?: unknown;
    summary?: unknown;
    body?: unknown;
  }) => void;
}) => {
  const model = requireAiModelForPurpose(
    "projectOverview",
    "AI-generated training workflows",
  );
  const result = streamText({
    model,
    output: Output.object({
      schema: ProjectOverviewOutputSchema,
      name: "projectOverview_output",
    }),
    system: PROJECT_OVERVIEW_SYSTEM,
    prompt,
    tools: getSearchToolsForSelectedProvider(),
    stopWhen: stepCountIs(4),
  });

  for await (const partial of result.partialOutputStream) {
    onPartial(partial);
  }

  return result.output;
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
