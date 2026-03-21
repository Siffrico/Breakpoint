import { err, ok, type Result } from "../../../lib/result";
import { gradeRetrievalAnswers } from "../policies/grade-retrieval-answers";
import type { RetrievalEvaluation, UnitContent } from "../types/becoming.types";

interface SubmitRetrievalDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
}

export const submitRetrievalWorkflow = async ({
  nodeId,
  answers,
  deps,
}: {
  nodeId: string;
  answers: string[];
  deps: SubmitRetrievalDependencies;
}): Promise<Result<RetrievalEvaluation>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  if (!unit) {
    return err("Unit content has not been generated yet.");
  }

  if (answers.some((answer) => answer.trim().length < 8)) {
    return err("Answer each retrieval prompt with a little more signal.");
  }

  return ok(
    gradeRetrievalAnswers({
      retrievalItems: unit.retrievalItems,
      answers,
    }),
  );
};
