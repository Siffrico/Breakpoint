with workspace as (
  select
    coalesce(release, 'local') as release,
    action,
    education_stage,
    outcome,
    (timings ->> 'totalMs')::double precision as total_ms,
    (timings ->> 'modelToFirstVisibleMs')::double precision as first_visible_ms,
    (timings ->> 'modelWindowMs')::double precision as model_ms,
    (timings ->> 'modelDoneToCommitMs')::double precision as commit_ms
  from workspace_turn_performance
  where created_at >= now() - interval '7 days'
)
select
  release,
  action,
  education_stage,
  count(*) as turns,
  round(100.0 * count(*) filter (where outcome <> 'success') / count(*), 2) as failure_percent,
  round(percentile_cont(0.5) within group (order by first_visible_ms)::numeric, 0) as first_visible_p50_ms,
  round(percentile_cont(0.95) within group (order by first_visible_ms)::numeric, 0) as first_visible_p95_ms,
  round(percentile_cont(0.95) within group (order by total_ms)::numeric, 0) as total_p95_ms,
  round(percentile_cont(0.95) within group (order by model_ms)::numeric, 0) as model_p95_ms,
  round(percentile_cont(0.95) within group (order by commit_ms)::numeric, 0) as commit_p95_ms
from workspace
group by release, action, education_stage
order by release desc, action, education_stage;

select
  coalesce(release, 'local') as release,
  route,
  name,
  count(*) as samples,
  round(percentile_cont(0.5) within group (order by value)::numeric, 2) as p50,
  round(percentile_cont(0.75) within group (order by value)::numeric, 2) as p75,
  round(100.0 * count(*) filter (where rating = 'poor') / count(*), 2) as poor_percent
from web_vital_performance
where created_at >= now() - interval '7 days'
group by release, route, name
order by release desc, route, name;
