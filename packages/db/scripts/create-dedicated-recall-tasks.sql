-- Nondestructive replacement for the legacy recall gate/probe/unit-run path.
-- Existing rows are intentionally retained until a product migration can map
-- their multi-item evidence to the new single-item assessment contract.

alter table becoming_knowledge_item
  add column if not exists review_due_at timestamp with time zone;

update becoming_knowledge_item
set review_due_at = coalesce(last_reinforced_at, checked_at) +
  case
    when strength <= 0 then interval '3 days'
    when strength = 1 then interval '7 days'
    when strength = 2 then interval '21 days'
    else interval '60 days'
  end
where status = 'checked' and review_due_at is null;

create table if not exists becoming_recall_task (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user"(id) on delete cascade,
  plan_id uuid not null references becoming_curriculum_plan(id) on delete restrict,
  session_id uuid not null references becoming_onboarding_session(id) on delete cascade,
  knowledge_item_id uuid,
  original_teaching_unit_node_id uuid,
  strength_at_reservation integer not null,
  knowledge_snapshot_json jsonb not null,
  scenario_json jsonb,
  state varchar(24) not null default 'preparing',
  interaction_id uuid,
  current_question text,
  first_retrieval_json jsonb,
  correction_history_json jsonb not null default '[]'::jsonb,
  preparation_lease_id uuid,
  preparation_lease_expires_at timestamp with time zone,
  turn_lease_id uuid,
  turn_lease_expires_at timestamp with time zone,
  last_offered_boundary_node_id uuid,
  paused_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint becoming_recall_task_state_check
    check (state in ('preparing', 'ready', 'retrieving', 'correcting', 'complete'))
);

create unique index if not exists becoming_recall_task_one_unfinished_plan_idx
  on becoming_recall_task(plan_id) where state <> 'complete';
create index if not exists becoming_recall_task_owner_session_state_idx
  on becoming_recall_task(user_id, session_id, state);
create index if not exists becoming_recall_task_preparation_lease_idx
  on becoming_recall_task(state, preparation_lease_expires_at);

create table if not exists becoming_recall_submission (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references becoming_recall_task(id) on delete cascade,
  request_id uuid not null,
  interaction_id uuid not null,
  answer text not null,
  status varchar(24) not null default 'processing',
  lease_id uuid,
  lease_expires_at timestamp with time zone,
  response_json jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint becoming_recall_submission_status_check
    check (status in ('processing', 'committed', 'failed'))
);

create unique index if not exists becoming_recall_submission_task_request_idx
  on becoming_recall_submission(task_id, request_id);
create unique index if not exists becoming_recall_submission_task_interaction_idx
  on becoming_recall_submission(task_id, interaction_id);
create index if not exists becoming_recall_submission_lease_idx
  on becoming_recall_submission(status, lease_expires_at);
