import { err, ok, type Result } from "../../../lib/result";
import { generateBuildContent } from "../generate-build-content";
import { generatePracticePrompts } from "../generate-practice-prompts";
import type {
  PostSeedGenerationResult,
  PhaseResponseRecord,
  PracticePrompt,
  UpdateUnitContentInput,
  UnitContent,
} from "../types/becoming.types";

interface SubmitSeedDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getTargetIdentity: (sessionId: string) => Promise<string | null>;
  savePhaseResponse: (input: {
    unitContentId: string;
    sessionId: string;
    userId?: string | null;
    phase: PhaseResponseRecord["phase"];
    sequence: number;
    userResponse: string;
    aiResponse?: string | null;
    passed?: boolean | null;
    score?: number | null;
    metadata?: PhaseResponseRecord["metadata"];
  }) => Promise<PhaseResponseRecord | null>;
  updateUnitContent: (
    input: UpdateUnitContentInput,
  ) => Promise<UnitContent | null>;
}

export const submitSeedWorkflow = async ({
  nodeId,
  sessionId,
  response,
  userId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  response: string;
  userId?: string | null;
  deps: SubmitSeedDependencies;
}): Promise<Result<PostSeedGenerationResult>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 20) {
    return err("Write at least a little signal before capturing the seed.");
  }

  await deps.savePhaseResponse({
    unitContentId: unit.id,
    sessionId,
    userId,
    phase: "seed",
    sequence: 0,
    userResponse: trimmedResponse,
  });

  if (unit.buildContent != null) {
    if (!unit.practicePrompts) {
      return err("Practice prompts are missing for this unit.");
    }

    return ok({
      captured: true,
      buildContent: unit.buildContent,
      practicePrompts: unit.practicePrompts,
    });
  }

  const targetIdentity = await deps.getTargetIdentity(sessionId);
  if (!targetIdentity) {
    return err("Target identity is missing.");
  }

  let buildContent: string;
  try {
    buildContent = await generateBuildContent({
      unitTitle: unit.title,
      unitSummary: unit.summary,
      whyItMatters: unit.whyItMatters,
      seedResponse: trimmedResponse,
      targetIdentity,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate build content.",
    );
  }

  let practicePrompts: PracticePrompt[];
  try {
    practicePrompts = await generatePracticePrompts({
      unitTitle: unit.title,
      unitSummary: unit.summary,
      seedResponse: trimmedResponse,
      buildContent,
      targetIdentity,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate practice prompts.",
    );
  }

  const updatedUnit = await deps.updateUnitContent({
    unitContentId: unit.id,
    buildContent,
    practicePrompts,
    contentGeneratedAt: new Date(),
  });

  if (!updatedUnit?.buildContent || !updatedUnit.practicePrompts) {
    return err("Generated unit content could not be saved.");
  }

  return ok({
    captured: true,
    buildContent: updatedUnit.buildContent,
    practicePrompts: updatedUnit.practicePrompts,
  });
};
