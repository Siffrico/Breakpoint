BEGIN;

ALTER TABLE becoming_unit_content
  RENAME COLUMN unit_mastery_contract_json TO unit_context_json;

ALTER TABLE becoming_unit_run
  RENAME COLUMN mastery_contract_json TO unit_context_json;

ALTER TABLE becoming_unit_run
  DROP COLUMN reviewer_feedback;

COMMIT;
