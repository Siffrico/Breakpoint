BEGIN;

ALTER TABLE becoming_unit_content
  DROP COLUMN seed_prompt,
  DROP COLUMN seed_hint,
  DROP COLUMN complexity_budget,
  DROP COLUMN build_content,
  DROP COLUMN practice_prompts,
  DROP COLUMN content_generated_at,
  DROP COLUMN teachback_setup;

COMMIT;
