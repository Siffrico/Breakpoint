export const RESUMABLE_MISSION_STATUSES = ["drafting", "active"] as const;

/**
 * The curriculum parents whose mastered units earn a field mission.
 *
 * NOTE: "skill_cluster" is dead — the v4 node check constraint
 * (becoming_curriculum_node_v4_shape) allows only root | ability | skill | unit,
 * so today only an `ability` parent can ever match. It is kept verbatim here
 * because this refactor must not change progression semantics; deciding whether
 * units under `skill` should earn missions is a separate product call.
 */
const MISSION_EARNING_PARENT_KINDS = ["ability", "skill_cluster"];

/**
 * The one definition of mission eligibility. It previously lived inside the
 * repository, which put a progression policy in the data layer and left four
 * call sites re-deriving it. Pure over its inputs, so it is testable without a
 * database.
 */
export const isEligibleForMission = ({
  run,
  parentNode,
}: {
  readonly run: { readonly phase: string };
  readonly parentNode: { readonly kind: string } | null;
}): boolean =>
  run.phase === "mastered" &&
  parentNode !== null &&
  MISSION_EARNING_PARENT_KINDS.includes(parentNode.kind);
