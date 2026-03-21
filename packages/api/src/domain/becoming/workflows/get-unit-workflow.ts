import { err, ok, type Result } from "../../../lib/result";
import type { UnitContent } from "../types/becoming.types";

interface GetUnitDependencies {
  getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
}

export const getUnitWorkflow = async ({
  nodeId,
  deps,
}: {
  nodeId: string;
  deps: GetUnitDependencies;
}): Promise<Result<UnitContent>> => {
  const unit = await deps.getUnitByNodeId(nodeId);
  return unit ? ok(unit) : err("Unit content has not been generated yet.");
};
