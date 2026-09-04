create table if not exists workspace_turn_performance (
  id uuid primary key default gen_random_uuid() not null,
  session_id uuid not null references becoming_onboarding_session(id) on delete cascade,
  turn_id varchar(96) not null,
  action varchar(32) not null,
  education_stage varchar(32),
  outcome varchar(24) not null,
  error_tag varchar(96),
  release varchar(128),
  timings jsonb not null,
  model_attempts jsonb not null,
  created_at timestamptz default now() not null
);

create index if not exists workspace_turn_performance_created_idx
  on workspace_turn_performance(created_at);
create index if not exists workspace_turn_performance_outcome_created_idx
  on workspace_turn_performance(outcome, created_at);
create index if not exists workspace_turn_performance_session_turn_idx
  on workspace_turn_performance(session_id, turn_id);

create table if not exists web_vital_performance (
  id uuid primary key default gen_random_uuid() not null,
  route varchar(512) not null,
  name varchar(16) not null,
  value double precision not null,
  delta double precision not null,
  rating varchar(24) not null,
  navigation_type varchar(32) not null,
  release varchar(128),
  created_at timestamptz default now() not null
);

create index if not exists web_vital_performance_created_idx
  on web_vital_performance(created_at);
create index if not exists web_vital_performance_name_created_idx
  on web_vital_performance(name, created_at);
create index if not exists web_vital_performance_route_created_idx
  on web_vital_performance(route, created_at);
