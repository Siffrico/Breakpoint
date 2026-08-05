BEGIN;

ALTER TABLE becoming_curriculum_plan
  ADD COLUMN curriculum_mode varchar(24) NOT NULL DEFAULT 'ability',
  ADD COLUMN outcome_ordering varchar(16);

COMMIT;
