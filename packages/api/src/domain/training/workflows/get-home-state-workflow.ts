import { err, ok  } from "../../../lib/result";
import type {Result} from "../../../lib/result";
import type { HomeState } from "../types/training.types";

interface GetHomeStateDependencies {
  getHomeState: (sessionId: string) => Promise<HomeState | null>;
}

export const getHomeStateWorkflow = async ({
  sessionId,
  deps,
}: {
  sessionId: string;
  deps: GetHomeStateDependencies;
}): Promise<Result<HomeState>> => {
  const state = await deps.getHomeState(sessionId);
  return state ? ok(state) : err("Home state is not ready yet.");
};
