import type { EducationExperienceDefinition } from "../education-unit/experience";
import type { PersistedUnitRun } from "../education-unit/unit-state";
import type {
  CurriculumPlan,
  PhaseResponseRecord,
  UnitContent,
} from "../types/training.types";
import type { WorkspaceAiMessage } from "./types";
import { makeDbError } from "../../../effect/db";
import { DEFAULT_EDUCATION_EXPERIENCE } from "../education-unit/experience";

const read = async <A>(
  operation: string,
  run: () => Promise<A>,
): Promise<A> => {
  try {
    return await run();
  } catch (cause) {
    throw makeDbError(operation, cause);
  }
};

export interface WorkspaceProjectionReaderSource {
  readonly getEducationExperience?: () => Promise<EducationExperienceDefinition>;
  readonly getActivePlan: (sessionId: string) => Promise<CurriculumPlan | null>;
  readonly getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
  readonly getUnitRun: (
    sessionId: string,
    unitContentId: string,
  ) => Promise<PersistedUnitRun | null>;
  readonly getUnitByNodeId: (nodeId: string) => Promise<UnitContent | null>;
}

export const makeWorkspaceProjectionReader = (
  source: WorkspaceProjectionReaderSource,
): Required<WorkspaceProjectionReaderSource> => ({
  getEducationExperience: () =>
    source.getEducationExperience
      ? read("getEducationExperience", source.getEducationExperience)
      : Promise.resolve(DEFAULT_EDUCATION_EXPERIENCE),
  getActivePlan: (sessionId) =>
    read("getActivePlan", () => source.getActivePlan(sessionId)),
  getPhaseResponses: (unitContentId, sessionId) =>
    read("getPhaseResponses", () =>
      source.getPhaseResponses(unitContentId, sessionId),
    ),
  getUnitRun: (sessionId, unitContentId) =>
    read("getUnitRun", () => source.getUnitRun(sessionId, unitContentId)),
  getUnitByNodeId: (nodeId) =>
    read("getUnitByNodeId", () => source.getUnitByNodeId(nodeId)),
});

export interface AiWorkspaceReaderSource {
  readonly listUnitMessages: (
    sessionId: string,
    unitId: string,
  ) => Promise<WorkspaceAiMessage[]>;
}

export const makeAiWorkspaceReader = (
  source: AiWorkspaceReaderSource,
): AiWorkspaceReaderSource => ({
  listUnitMessages: (sessionId, unitId) =>
    read("listUnitMessages", () => source.listUnitMessages(sessionId, unitId)),
});
