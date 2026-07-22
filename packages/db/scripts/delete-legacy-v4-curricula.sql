begin;

create temporary table legacy_plan_ids on commit drop as
select distinct plan.id
from becoming_curriculum_plan as plan
join becoming_curriculum_node as node on node.plan_id = plan.id
where node.kind not in ('root', 'ability', 'skill', 'unit')
   or (
     node.kind = 'ability'
     and (
       node.ability_stage is null
       or node.ability_stage not in ('foundations', 'skillset', 'mastered')
     )
   )
   or (node.kind <> 'ability' and node.ability_stage is not null)
   or (
     node.kind in ('ability', 'skill')
     and (
       node.skill_map is null
       or coalesce(node.skill_map ->> 'scenarioArchetype', '') not in ('select', 'transform', 'judge')
       or node.skill_map ? 'scenarioFormats'
     )
   )
   or (node.kind in ('root', 'unit') and node.skill_map is not null);

create temporary table legacy_session_ids on commit drop as
select onboarding_session_id as id
from becoming_curriculum_plan
where id in (select id from legacy_plan_ids);

update becoming_onboarding_session
set status = 'ready_for_generation',
    completed_at = null
where id in (select id from legacy_session_ids);

delete from becoming_project_build_checkpoint
where session_id in (select id from legacy_session_ids);

delete from becoming_curriculum_plan
where id in (select id from legacy_plan_ids);

alter table becoming_curriculum_node
drop constraint if exists becoming_curriculum_node_v4_shape;

alter table becoming_curriculum_node
add constraint becoming_curriculum_node_v4_shape check (
  (
    (
      kind = 'ability'
      and ability_stage is not null
      and ability_stage in ('foundations', 'skillset', 'mastered')
    )
    or (kind <> 'ability' and ability_stage is null)
  )
  and kind in ('root', 'ability', 'skill', 'unit')
  and (
    (
      kind in ('ability', 'skill')
      and skill_map is not null
      and coalesce(skill_map ->> 'scenarioArchetype', '') in ('select', 'transform', 'judge')
      and not (skill_map ? 'scenarioFormats')
    )
    or (kind in ('root', 'unit') and skill_map is null)
  )
);

create temporary table legacy_run_keys on commit drop as
select unit_content_id, session_id
from becoming_unit_run
where recipe_version not in ('education-unit-v2', 'recall-v2');

delete from becoming_unit_phase_response as response
using legacy_run_keys
where response.unit_content_id = legacy_run_keys.unit_content_id
  and response.session_id = legacy_run_keys.session_id;

delete from becoming_unit_run
where recipe_version not in ('education-unit-v2', 'recall-v2');

delete from becoming_unit_phase_response
where metadata ->> 'aiEducationStage' is not null
  and metadata ->> 'aiEducationStage' not in ('orient', 'connect', 'solve', 'teach', 'mastered');

commit;
