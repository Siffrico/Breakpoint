BEGIN;

ALTER TABLE becoming_identity_profile_version
  ADD COLUMN IF NOT EXISTS quality_standards jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
