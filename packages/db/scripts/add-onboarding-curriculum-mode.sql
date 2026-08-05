BEGIN;

ALTER TABLE becoming_onboarding_session
  ADD COLUMN curriculum_mode varchar(24) NOT NULL DEFAULT 'ability';

COMMIT;
