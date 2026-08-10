-- Unify the curriculum on the outcome model: one node shape, no mode switches.
--
-- Final-state and idempotent. Safe on a fresh database and safe to re-run on one
-- that already has it; there is no ordering dependency on any other script here.
--
-- DESTRUCTIVE, deliberately: every curriculum plan is deleted. Plans written
-- under the ability/mode model cannot satisfy the outcome shape below, and there
-- is no meaningful translation from an ability tree to an outcome tree. There are
-- no production users, so the retention decision is "discard and rebuild" rather
-- than a backfill nobody would ever read.

BEGIN;

-- Sessions that owned a deleted plan are sent back to the generation step, and
-- their build checkpoints go with the plan. Without this a completed session
-- points at nothing: the build's idempotency short-circuit sees no plan row while
-- the artifact registry still reports the curriculum "complete", so the rebuild
-- skips persistCurriculum and produces a plan with no nodes.
DELETE FROM becoming_project_build_checkpoint
WHERE session_id IN (SELECT onboarding_session_id FROM becoming_curriculum_plan);

UPDATE becoming_onboarding_session
SET status = 'ready_for_generation',
    completed_at = NULL
WHERE id IN (SELECT onboarding_session_id FROM becoming_curriculum_plan);

DELETE FROM becoming_curriculum_plan;

-- Mode fields are gone: onboarding no longer chooses between curriculum shapes,
-- so there is nothing to switch on and nothing to order outcomes by.
ALTER TABLE becoming_onboarding_session
  DROP COLUMN IF EXISTS curriculum_mode;

ALTER TABLE becoming_curriculum_plan
  DROP COLUMN IF EXISTS curriculum_mode,
  DROP COLUMN IF EXISTS outcome_ordering;

ALTER TABLE becoming_curriculum_node
  DROP CONSTRAINT IF EXISTS becoming_curriculum_node_v4_shape,
  DROP COLUMN IF EXISTS ability_stage,
  DROP COLUMN IF EXISTS practiced_skill_node_id;

ALTER TABLE becoming_curriculum_node
  ADD COLUMN IF NOT EXISTS outcome_result text,
  ADD COLUMN IF NOT EXISTS practice_contract jsonb;

ALTER TABLE becoming_curriculum_node
  ADD CONSTRAINT becoming_curriculum_node_v4_shape CHECK (
    kind IN ('root', 'outcome', 'unit')
    AND (
      (
        kind = 'outcome'
        AND outcome_result IS NOT NULL
        AND (
          (skill_map IS NULL AND practice_contract IS NULL)
          OR (skill_map IS NOT NULL AND practice_contract IS NOT NULL)
        )
      )
      OR (
        kind IN ('root', 'unit')
        AND outcome_result IS NULL
        AND skill_map IS NULL
        AND practice_contract IS NULL
      )
    )
  );

-- Outcome compilation and unit seeding are tracked by becoming_node_build alone.
-- These rows were written by the project builder but never read back, so they are
-- inert history; drop them so nothing can revive a competing lifecycle.
DELETE FROM becoming_project_build_checkpoint
WHERE step IN ('outcomeCurriculum', 'unitSeed');

COMMIT;
