import type { RecallTaskState } from "@acme/validators";

export type RecallEvent =
  | { readonly type: "scenario_saved" }
  | { readonly type: "started" }
  | { readonly type: "retrieval_graded"; readonly passed: boolean }
  | { readonly type: "correction_graded"; readonly passed: boolean };

export class InvalidRecallTransitionError extends Error {
  readonly name = "InvalidRecallTransitionError";
}

export const transitionRecallTask = (
  state: RecallTaskState,
  event: RecallEvent,
): RecallTaskState => {
  switch (state) {
    case "preparing":
      if (event.type === "scenario_saved") return "ready";
      break;
    case "ready":
      if (event.type === "started") return "retrieving";
      break;
    case "retrieving":
      if (event.type === "retrieval_graded") {
        return event.passed ? "complete" : "correcting";
      }
      break;
    case "correcting":
      if (event.type === "correction_graded") {
        return event.passed ? "complete" : "correcting";
      }
      break;
    case "complete":
      break;
  }
  throw new InvalidRecallTransitionError(
    `Recall event ${event.type} is invalid while task is ${state}.`,
  );
};

export const assertCriterionEvidence = ({
  criterionIds,
  evidenceIds,
}: {
  readonly criterionIds: readonly string[];
  readonly evidenceIds: readonly string[];
}): void => {
  const expected = [...criterionIds].sort();
  const received = [...evidenceIds].sort();
  if (
    expected.length !== received.length ||
    expected.some((id, index) => id !== received[index])
  ) {
    throw new Error(
      "Assessment evidence must cover each assigned criterion once.",
    );
  }
};
