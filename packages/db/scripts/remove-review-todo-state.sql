BEGIN;

ALTER TABLE becoming_unit_run
  DROP COLUMN review_todos_json;

COMMIT;
