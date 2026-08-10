BEGIN;

ALTER TABLE becoming_knowledge_question
  ADD COLUMN IF NOT EXISTS practice_count integer NOT NULL DEFAULT 0;

ALTER TABLE becoming_knowledge_item
  DROP COLUMN IF EXISTS coverage_count;

COMMIT;
