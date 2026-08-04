BEGIN;

ALTER TABLE becoming_unit_run
  ADD COLUMN todos_json jsonb;

UPDATE becoming_unit_run AS run
SET todos_json =
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'kind', 'capability',
          'status', capability->'status',
          'dimensionId', capability->'dimensionId'
        )
      )
      FROM jsonb_array_elements(run.capability_todos_json) AS capability
    ),
    '[]'::jsonb
  ) ||
  CASE
    WHEN run.mode = 'learning' THEN
      jsonb_build_array(
        jsonb_build_object('kind', 'solve', 'status', 'pending', 'pass', 1, 'challenge', null),
        jsonb_build_object('kind', 'complete', 'status', 'pending', 'pass', 1, 'endsOn', CASE WHEN run.kind = 'recall' THEN 'any' ELSE 'never' END, 'result', null)
      )
    WHEN run.mode IN ('awaiting_next_pass', 'awaiting_pass2') THEN
      jsonb_build_array(
        jsonb_build_object('kind', 'solve', 'status', 'pending', 'pass', run.review_pass + 1, 'challenge', run.pending_pass2_challenge_json),
        jsonb_build_object('kind', 'complete', 'status', 'pending', 'pass', run.review_pass + 1, 'endsOn', CASE WHEN run.kind = 'recall' THEN 'any' ELSE 'pass' END, 'result', null)
      )
    WHEN run.mode = 'complete' THEN
      jsonb_build_array(
        jsonb_build_object('kind', 'solve', 'status', 'completed', 'pass', run.review_pass, 'challenge', run.active_review_challenge_json),
        jsonb_build_object('kind', 'complete', 'status', 'completed', 'pass', run.review_pass, 'endsOn', CASE WHEN run.kind = 'recall' THEN 'any' WHEN run.review_pass > 1 THEN 'pass' ELSE 'never' END, 'result', null)
      )
    ELSE
      jsonb_build_array(
        jsonb_build_object('kind', 'solve', 'status', CASE WHEN run.active_review_challenge_json IS NULL THEN 'pending' ELSE 'presented' END, 'pass', run.review_pass, 'challenge', run.active_review_challenge_json),
        jsonb_build_object('kind', 'complete', 'status', 'pending', 'pass', run.review_pass, 'endsOn', CASE WHEN run.kind = 'recall' THEN 'any' WHEN run.review_pass > 1 THEN 'pass' ELSE 'never' END, 'result', null)
      )
  END;

ALTER TABLE becoming_unit_run
  ALTER COLUMN todos_json SET NOT NULL,
  DROP COLUMN capability_todos_json,
  DROP COLUMN active_review_challenge_json,
  DROP COLUMN review_pass,
  DROP COLUMN repair_spent,
  DROP COLUMN pending_pass2_challenge_json;

UPDATE becoming_unit_run
SET mode = 'awaiting_next_pass'
WHERE mode = 'awaiting_pass2';

COMMIT;
