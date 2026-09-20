import { Effect } from "effect";

import type {
  EducationUnitState,
  PhaseResponseRecord,
} from "../types/training.types";
import type { UnitPreparationError } from "../unit-preparation/errors";
import type { UnitPreparationDependencies } from "../unit-preparation/prepare-unit-content";
import { getUnitReadinessIssue } from "../education-unit/unit-readiness";
import { generateClusterBriefing } from "../generate-cluster-briefing";
import { getEducationUnitState } from "../policies/education-unit-state-policy";
import {
  UnitContextMissingError,
  UnitPersistError,
} from "../unit-preparation/errors";
import { prepareUnitContent } from "../unit-preparation/prepare-unit-content";

interface PrepareUnitDependencies extends UnitPreparationDependencies {
  getPhaseResponses: (
    unitContentId: string,
    sessionId: string,
  ) => Promise<PhaseResponseRecord[]>;
}

export const prepareUnitWorkflow = ({
  nodeId,
  sessionId,
  deps,
}: {
  nodeId: string;
  sessionId: string;
  deps: PrepareUnitDependencies;
}): Effect.Effect<EducationUnitState, UnitPreparationError> =>
  Effect.gen(function* () {
    const planNodes = yield* Effect.tryPromise({
      try: () => deps.getPlanNodesBySession(sessionId),
      catch: (cause) =>
        new UnitPersistError({ message: "Curriculum lookup failed.", cause }),
    });
    const node = planNodes?.find((item) => item.id === nodeId);
    if (node?.kind !== "unit") {
      return yield* new UnitContextMissingError({
        message: "Unit node does not exist in this learning project.",
      });
    }
    const existingUnit = yield* Effect.tryPromise({
      try: () => deps.getUnitByNodeId(nodeId),
      catch: (cause) =>
        new UnitPersistError({ message: "Unit content lookup failed.", cause }),
    });
    if (node.status !== "ready" && !existingUnit) {
      return yield* new UnitContextMissingError({
        message: "This unit is not ready yet.",
      });
    }
    const parentNode = planNodes?.find((item) => item.id === node.parentNodeId);
    const siblingUnits = planNodes?.filter(
      (item) => item.parentNodeId === node.parentNodeId && item.kind === "unit",
    );
    const unit =
      existingUnit && getUnitReadinessIssue(existingUnit) === null
        ? existingUnit
        : yield* prepareUnitContent({
            node,
            sessionId,
            deps,
            forceRefresh: existingUnit !== null,
            prepareClusterBriefing: parentNode
              ? async () => ({
                  nodeId: parentNode.id,
                  briefing: await generateClusterBriefing({
                    slotKind: "unit",
                    totalSlots: siblingUnits?.length ?? 1,
                    clusterContext: {
                      title: parentNode.title,
                      summary: parentNode.summary,
                      whyItMatters: parentNode.whyItMatters,
                    },
                  }),
                })
              : undefined,
          });
    const responses = yield* Effect.tryPromise({
      try: () => deps.getPhaseResponses(unit.id, sessionId),
      catch: (cause) =>
        new UnitPersistError({
          message: "Unit progress lookup failed.",
          cause,
        }),
    });
    return getEducationUnitState({ unit, responses });
  });
