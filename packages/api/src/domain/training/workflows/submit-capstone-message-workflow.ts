import { err, ok, type Result } from "../../../lib/result";
import type {
  CapstoneEvaluation,
  CapstoneMessage,
  CapstoneScenario,
  CapstoneTurnResult,
} from "../types/training.types";
import { advanceDebateRound } from "../capstone/advance-debate-round";
import { advanceTeachRound } from "../capstone/advance-teach-round";
import { evaluateBuildCapstone } from "../capstone/evaluate-build";
import { evaluateDebateCapstone } from "../capstone/evaluate-debate";
import { evaluateTeachCapstone } from "../capstone/evaluate-teach";

interface SubmitCapstoneDependencies {
  getNodeById: (nodeId: string) => Promise<{
    id: string;
    kind: string;
    status: string;
  } | null>;
  getCapstoneByNodeId: (simulationNodeId: string, sessionId: string) => Promise<{
    id: string;
    status: string;
    scenario: CapstoneScenario;
    currentRound: number;
    maxRounds: number;
  } | null>;
  listCapstoneMessages: (capstoneId: string) => Promise<CapstoneMessage[]>;
  appendCapstoneMessage: (input: {
    capstoneId: string;
    role: CapstoneMessage["role"];
    content: string;
    sequence: number;
    round: number;
  }) => Promise<CapstoneMessage | null>;
  updateCapstone: (input: {
    capstoneId: string;
    status?: "pending" | "in_progress" | "passed" | "failed";
    currentRound?: number;
    score?: number | null;
    feedback?: string | null;
  }) => Promise<unknown>;
  completeNode: (nodeId: string) => Promise<void>;
}

const normalizeEvaluation = (evaluation: CapstoneEvaluation) => ({
  status: evaluation.passed ? ("passed" as const) : ("failed" as const),
  score: evaluation.score,
  feedback: evaluation.feedback,
});

export const submitCapstoneMessageWorkflow = async ({
  nodeId,
  sessionId,
  response,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  response: string;
  deps: SubmitCapstoneDependencies;
}): Promise<Result<CapstoneTurnResult>> => {
  const node = await deps.getNodeById(nodeId);
  if (!node || node.kind !== "simulation") {
    return err("This node is not a simulation capstone.");
  }

  const capstone = await deps.getCapstoneByNodeId(nodeId, sessionId);
  if (!capstone) {
    return err("Capstone has not been generated yet.");
  }

  if (capstone.status === "passed" || capstone.status === "failed") {
    return err("This capstone has already been completed.");
  }

  const trimmedResponse = response.trim();
  if (trimmedResponse.length < 50) {
    return err("Give a fuller capstone response before submitting.");
  }

  const messages = await deps.listCapstoneMessages(capstone.id);
  const nextRound = capstone.currentRound + 1;
  const userSequence = messages.length;
  const userMessage =
    await deps.appendCapstoneMessage({
      capstoneId: capstone.id,
      role: "user",
      content: trimmedResponse,
      sequence: userSequence,
      round: nextRound,
    });

  if (!userMessage) {
    return err("Failed to save the capstone response.");
  }

  const transcript = [...messages, userMessage];

  if (capstone.scenario.format === "build") {
    let evaluation;
    try {
      evaluation = normalizeEvaluation(
        await evaluateBuildCapstone({
          scenario: capstone.scenario,
          messages: transcript,
        }),
      );
    } catch (error) {
      return err(
        error instanceof Error
          ? error.message
          : "Failed to evaluate the build capstone.",
      );
    }

    if (evaluation.status === "passed" || nextRound >= capstone.maxRounds) {
      await deps.updateCapstone({
        capstoneId: capstone.id,
        status: evaluation.status,
        currentRound: nextRound,
        score: evaluation.score,
        feedback: evaluation.feedback,
      });

      if (evaluation.status === "passed" && node.status !== "completed") {
        await deps.completeNode(nodeId);
      }

      return ok({
        assistantReply: null,
        status: evaluation.status,
        round: nextRound,
        score: evaluation.score,
        feedback: evaluation.feedback,
      });
    }

    const revisionReply = `Revise and resubmit. ${evaluation.feedback}`;
    await deps.appendCapstoneMessage({
      capstoneId: capstone.id,
      role: "assistant",
      content: revisionReply,
      sequence: userSequence + 1,
      round: nextRound,
    });
    await deps.updateCapstone({
      capstoneId: capstone.id,
      status: "in_progress",
      currentRound: nextRound,
    });

    return ok({
      assistantReply: revisionReply,
      status: "in_progress",
      round: nextRound,
      score: null,
      feedback: null,
    });
  }

  if (nextRound >= capstone.maxRounds) {
    let evaluation;
    try {
      evaluation =
        capstone.scenario.format === "debate"
          ? normalizeEvaluation(
              await evaluateDebateCapstone({
                scenario: capstone.scenario,
                messages: transcript,
              }),
            )
          : normalizeEvaluation(
              await evaluateTeachCapstone({
                scenario: capstone.scenario,
                messages: transcript,
              }),
            );
    } catch (error) {
      return err(
        error instanceof Error
          ? error.message
          : "Failed to evaluate the capstone.",
      );
    }

    await deps.updateCapstone({
      capstoneId: capstone.id,
      status: evaluation.status,
      currentRound: nextRound,
      score: evaluation.score,
      feedback: evaluation.feedback,
    });

    if (evaluation.status === "passed" && node.status !== "completed") {
      await deps.completeNode(nodeId);
    }

    return ok({
      assistantReply: null,
      status: evaluation.status,
      round: nextRound,
      score: evaluation.score,
      feedback: evaluation.feedback,
    });
  }

  let assistantReply: string;
  try {
    assistantReply =
      capstone.scenario.format === "debate"
        ? await advanceDebateRound({
            scenario: capstone.scenario,
            messages: transcript,
            round: nextRound,
          })
        : await advanceTeachRound({
            scenario: capstone.scenario,
            messages: transcript,
            round: nextRound,
          });
  } catch (error) {
    return err(
      error instanceof Error
        ? error.message
        : "Failed to generate the next capstone round.",
    );
  }

  await deps.appendCapstoneMessage({
    capstoneId: capstone.id,
    role: "assistant",
    content: assistantReply,
    sequence: userSequence + 1,
    round: nextRound,
  });
  await deps.updateCapstone({
    capstoneId: capstone.id,
    status: "in_progress",
    currentRound: nextRound,
  });

  return ok({
    assistantReply,
    status: "in_progress",
    round: nextRound,
    score: null,
    feedback: null,
  });
};
