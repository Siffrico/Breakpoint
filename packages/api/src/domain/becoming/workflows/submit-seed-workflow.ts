import { err, ok, type Result } from "../../../lib/result";
import { generateUnitLesson } from "../orchestration/unit-flow";
import type {
  PostSeedGenerationResult,
  PhaseResponseRecord,
  UpdateUnitContentInput,
  UnitContent,
} from "../types/becoming.types";

interface SubmitSeedDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
  getTargetIdentity: (sessionId: string) => Promise<string | null>;
  getNodeById: (nodeId: string) => Promise<{
    id: string;
    parentNodeId: string | null;
    kind: string;
    title: string;
    summary: string;
    whyItMatters: string;
    orderIndex: number;
    status: string;
  } | null>;
  getPlanNodesBySession: (sessionId: string) => Promise<
    Array<{
      id: string;
      parentNodeId: string | null;
      kind: string;
      title: string;
      summary: string;
      whyItMatters: string;
      orderIndex: number;
      status: string;
    }> | null
  >;
  listAttemptHistory: (sessionId: string) => Promise<
    Array<{
      title: string;
      score: number;
      readiness: string;
      finalArticulation: string | null;
      growthDimensions: string[] | null;
      improvements: string[];
      failureTags: string[];
      nextStep: string;
    }>
  >;
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

  const [node, planNodes, priorLearning] = await Promise.all([
    deps.getNodeById(nodeId),
    deps.getPlanNodesBySession(sessionId),
    deps.listAttemptHistory(sessionId),
  ]);

  if (!node || !planNodes) {
    return err("Unit planning context is missing.");
  }

  const parentNode = node.parentNodeId
    ? planNodes.find((item) => item.id === node.parentNodeId) ?? null
    : null;

  const siblingUnits = planNodes
    .filter(
      (item) => item.parentNodeId === node.parentNodeId && item.kind === node.kind,
    )
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const slotIndex =
    Math.max(
      siblingUnits.findIndex((item) => item.id === node.id),
      0,
    ) + 1;

  const completedClusterTitles = planNodes
    .filter((item) => item.kind === "skill_cluster")
    .filter((clusterNode) => {
      const childUnits = planNodes.filter(
        (item) => item.parentNodeId === clusterNode.id && item.kind === "unit",
      );

      return childUnits.length > 0 && childUnits.every((item) => item.status === "completed");
    })
    .map((item) => item.title);

  let generatedLesson: PostSeedGenerationResult;
  let generatedTeachbackSetup: UnitContent["teachbackSetup"];
  try {
    const lesson = await generateUnitLesson({
      nodeId: node.id,
      slotKind: node.kind as "unit" | "integration",
      slotIndex,
      totalSlots: siblingUnits.length || 1,
      clusterContext: parentNode
        ? {
            title: parentNode.title,
            summary: parentNode.summary,
            whyItMatters: parentNode.whyItMatters,
          }
        : null,
      integrationContext:
        node.kind === "integration"
          ? {
              completedClusterTitles,
            }
          : null,
      targetIdentity,
      priorLearning,
      seedResponse: trimmedResponse,
      currentUnit: unit,
    });

    generatedLesson = {
      captured: true,
      buildContent: lesson.buildContent,
      practicePrompts: lesson.practicePrompts,
    };
    generatedTeachbackSetup = lesson.teachbackSetup;
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate build content.",
    );
  }

  const updatedUnit = await deps.updateUnitContent({
    unitContentId: unit.id,
    buildContent: generatedLesson.buildContent,
    practicePrompts: generatedLesson.practicePrompts,
    teachbackSetup: generatedTeachbackSetup,
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
