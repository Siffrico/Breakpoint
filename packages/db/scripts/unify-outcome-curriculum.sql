BEGIN;

DELETE FROM becoming_curriculum_plan;

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

COMMIT;
