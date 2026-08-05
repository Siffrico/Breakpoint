BEGIN;

ALTER TABLE becoming_curriculum_node
  DROP CONSTRAINT becoming_curriculum_node_v4_shape;

ALTER TABLE becoming_curriculum_node
  ADD CONSTRAINT becoming_curriculum_node_v4_shape CHECK (
    (
      (
        kind = 'ability'
        AND ability_stage IS NOT NULL
        AND ability_stage IN ('foundations', 'skillset', 'mastered')
      )
      OR (kind <> 'ability' AND ability_stage IS NULL)
    )
    AND kind IN ('root', 'ability', 'skill', 'unit', 'outcome')
    AND (
      (
        kind IN ('ability', 'skill', 'outcome')
        AND skill_map IS NOT NULL
        AND COALESCE(skill_map ->> 'scenarioArchetype', '') IN (
          'select',
          'transform',
          'judge'
        )
        AND NOT (skill_map ? 'scenarioFormats')
      )
      OR (kind IN ('root', 'unit') AND skill_map IS NULL)
    )
    AND (kind = 'outcome' OR NOT (skill_map ? 'mainOutcome'))
  );

COMMIT;
