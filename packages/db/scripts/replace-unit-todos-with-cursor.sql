BEGIN;

ALTER TABLE becoming_unit_run ADD COLUMN cursor_json jsonb;

UPDATE becoming_unit_run AS run
SET cursor_json = jsonb_build_object(
  'interactionId', gen_random_uuid(),
  'scenarioPrompts', COALESCE(
    (
      SELECT jsonb_agg(todo->'challenge'->>'prompt')
      FROM jsonb_array_elements(run.todos_json) AS todo
      WHERE todo->>'kind' = 'solve' AND todo->'challenge' IS NOT NULL
    ),
    '[]'::jsonb
  ),
  'step', CASE
    WHEN run.mode = 'complete' THEN jsonb_build_object(
      'kind', 'complete',
      'attempt', 1,
      'outcome', 'retired',
      'evidence', '[]'::jsonb,
      'evidencedTargetIds', '[]'::jsonb
    )
    WHEN run.mode = 'awaiting_next_pass' THEN jsonb_build_object(
      'kind', 'feedback',
      'attempt', COALESCE(
        (SELECT MAX((todo->>'pass')::int) FROM jsonb_array_elements(run.todos_json) AS todo WHERE todo->>'kind' = 'complete' AND todo->>'status' = 'completed'),
        1
      ),
      'errorCodes', '[]'::jsonb,
      'dimensionResults', '[]'::jsonb,
      'preparedScenario', (
        SELECT todo->'challenge'
        FROM jsonb_array_elements(run.todos_json) AS todo
        WHERE todo->>'kind' = 'solve' AND todo->>'status' = 'pending'
        LIMIT 1
      )
    )
    WHEN run.mode = 'review' OR run.kind = 'recall' THEN jsonb_build_object(
      'kind', 'scenario',
      'attempt', COALESCE(
        (SELECT (todo->>'pass')::int FROM jsonb_array_elements(run.todos_json) AS todo WHERE todo->>'kind' = 'solve' AND todo->>'status' <> 'completed' LIMIT 1),
        1
      ),
      'challenge', (
        SELECT todo->'challenge'
        FROM jsonb_array_elements(run.todos_json) AS todo
        WHERE todo->>'kind' = 'solve' AND todo->>'status' <> 'completed'
        LIMIT 1
      )
    )
    ELSE jsonb_build_object(
      'kind', 'teachback',
      'preparedScenario', (
        SELECT todo->'challenge'
        FROM jsonb_array_elements(run.todos_json) AS todo
        WHERE todo->>'kind' = 'solve' AND todo->>'status' = 'pending'
        LIMIT 1
      )
    )
  END
);

ALTER TABLE becoming_unit_run
  ALTER COLUMN cursor_json SET NOT NULL,
  DROP COLUMN mode,
  DROP COLUMN todos_json;

COMMIT;
