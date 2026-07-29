BEGIN;

UPDATE becoming_unit_run
SET active_review_challenge_json = jsonb_set(
  active_review_challenge_json #- '{contract,scenarioStage}',
  '{contract,runKind}',
  to_jsonb(kind),
  true
)
WHERE active_review_challenge_json IS NOT NULL
  AND active_review_challenge_json->'contract' ? 'scenarioStage';

UPDATE becoming_training_scenario_attempt
SET scenario_contract_json = jsonb_set(
  scenario_contract_json - 'scenarioStage',
  '{runKind}',
  to_jsonb(
    CASE scenario_contract_json->>'scenarioStage'
      WHEN 'recall' THEN 'recall'
      ELSE 'education'
    END
  ),
  true
)
WHERE scenario_contract_json IS NOT NULL
  AND scenario_contract_json ? 'scenarioStage';

DROP INDEX IF EXISTS becoming_unit_run_session_unit_idx;

CREATE UNIQUE INDEX IF NOT EXISTS becoming_unit_run_session_unit_kind_idx
  ON becoming_unit_run (session_id, unit_content_id, kind);

COMMIT;
