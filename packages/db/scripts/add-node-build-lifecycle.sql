BEGIN;

CREATE TABLE IF NOT EXISTS becoming_node_build (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  node_id uuid NOT NULL REFERENCES becoming_curriculum_node(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  lease_id uuid,
  lease_expires_at timestamp with time zone,
  failure_code varchar(64),
  failure_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT becoming_node_build_status_check
    CHECK (status IN ('pending', 'running', 'ready', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS becoming_node_build_kind_node_idx
  ON becoming_node_build (kind, node_id);

CREATE INDEX IF NOT EXISTS becoming_node_build_status_lease_idx
  ON becoming_node_build (status, lease_expires_at);

COMMIT;
