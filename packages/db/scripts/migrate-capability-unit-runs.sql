BEGIN;

CREATE TABLE becoming_unit_run_legacy_capability_backup_20260730
  (LIKE becoming_unit_run INCLUDING ALL);

INSERT INTO becoming_unit_run_legacy_capability_backup_20260730
SELECT *
FROM becoming_unit_run;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM becoming_mission
    WHERE unit_run_id IN (SELECT id FROM becoming_unit_run)
  ) OR EXISTS (
    SELECT 1
    FROM becoming_training_scenario_attempt
    WHERE unit_run_id IN (SELECT id FROM becoming_unit_run)
  ) THEN
    RAISE EXCEPTION
      'Legacy unit runs still have dependent mission or scenario-attempt rows';
  END IF;
END
$$;

DELETE FROM becoming_unit_run;

DROP INDEX becoming_unit_run_session_unit_idx;

ALTER TABLE becoming_unit_run
  DROP COLUMN recipe_version,
  DROP COLUMN phase,
  DROP COLUMN pass,
  DROP COLUMN connect_grills,
  DROP COLUMN solve_repairs,
  DROP COLUMN scenario_spec_json,
  DROP COLUMN connect_teach_due,
  ADD COLUMN kind varchar(24) NOT NULL DEFAULT 'education',
  ADD COLUMN mode varchar(24) NOT NULL DEFAULT 'learning',
  ADD COLUMN experience_id varchar(96) NOT NULL DEFAULT 'breakpoint-mentor',
  ADD COLUMN experience_version integer NOT NULL DEFAULT 1,
  ADD COLUMN experience_json jsonb NOT NULL,
  ADD COLUMN mastery_contract_json jsonb NOT NULL,
  ADD COLUMN capability_todos_json jsonb NOT NULL,
  ADD COLUMN review_todos_json jsonb NOT NULL,
  ADD COLUMN active_review_challenge_json jsonb,
  ADD COLUMN reviewer_feedback text,
  ADD COLUMN has_review_grade boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX becoming_unit_run_session_unit_kind_idx
  ON becoming_unit_run (session_id, unit_content_id, kind);

COMMIT;
