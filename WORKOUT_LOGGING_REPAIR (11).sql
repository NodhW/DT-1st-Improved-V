-- Fit Together — workout logging repair + edit controls
-- Run after FINAL_MIGRATION.sql (and V2 social/challenges migration if used).
-- Safe to re-run.
--
-- Repairs workout logging by moving workout mutations through small, ownership-checked
-- SECURITY DEFINER RPCs. This avoids failures caused by stale/mismatched table grants or
-- RLS policies while keeping ownership enforcement in the database.
-- Adds deletion of selected sets/exercises and cancellation of an unfinished workout.

create or replace function public.start_workout(
  p_title text default 'Workout',
  p_plan_workout_id uuid default null
)
returns public.workouts
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare w public.workouts;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_title,''))) < 1 then raise exception 'Workout title is required'; end if;

  if p_plan_workout_id is not null and not exists (
    select 1
    from public.plan_workouts pw
    join public.training_plans tp on tp.id=pw.plan_id
    where pw.id=p_plan_workout_id and tp.user_id=auth.uid()
  ) then
    raise exception 'Plan workout not found';
  end if;

  insert into public.workouts(user_id,title,plan_workout_id)
  values(auth.uid(),left(trim(p_title),160),p_plan_workout_id)
  returning * into w;
  return w;
end;
$$;

create or replace function public.add_workout_exercise(
  p_workout_id uuid,
  p_exercise_id uuid,
  p_position integer default 0
)
returns public.workout_exercises
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare we public.workout_exercises;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.workouts where id=p_workout_id and user_id=auth.uid() and completed_at is null) then
    raise exception 'Active workout not found';
  end if;
  if not exists(select 1 from public.exercises where id=p_exercise_id) then
    raise exception 'Exercise not found';
  end if;
  if exists(select 1 from public.workout_exercises where workout_id=p_workout_id and exercise_id=p_exercise_id) then
    raise exception 'Exercise is already in this workout';
  end if;

  insert into public.workout_exercises(workout_id,exercise_id,position)
  values(p_workout_id,p_exercise_id,greatest(0,coalesce(p_position,0)))
  returning * into we;
  return we;
end;
$$;

create or replace function public.add_workout_set(
  p_workout_exercise_id uuid,
  p_set_number integer,
  p_reps integer default null,
  p_weight numeric default null,
  p_duration_seconds integer default null,
  p_rpe numeric default null
)
returns public.workout_sets
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare ws public.workout_sets;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists(
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id=we.workout_id
    where we.id=p_workout_exercise_id and w.user_id=auth.uid() and w.completed_at is null
  ) then
    raise exception 'Active workout exercise not found';
  end if;
  if coalesce(p_set_number,0) < 1 then raise exception 'Invalid set number'; end if;
  if p_reps is not null and p_reps < 0 then raise exception 'Invalid reps'; end if;
  if p_weight is not null and p_weight < 0 then raise exception 'Invalid weight'; end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then raise exception 'Invalid duration'; end if;
  if p_rpe is not null and (p_rpe < 1 or p_rpe > 10) then raise exception 'RPE must be between 1 and 10'; end if;

  insert into public.workout_sets(workout_exercise_id,set_number,reps,weight,duration_seconds,rpe,completed)
  values(p_workout_exercise_id,p_set_number,p_reps,p_weight,p_duration_seconds,p_rpe,true)
  returning * into ws;
  return ws;
end;
$$;

create or replace function public.delete_workout_set(p_set_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.workout_sets ws
  using public.workout_exercises we, public.workouts w
  where ws.id=p_set_id
    and ws.workout_exercise_id=we.id
    and we.workout_id=w.id
    and w.user_id=auth.uid()
    and w.completed_at is null;
  if not found then raise exception 'Set not found or workout is already finished'; end if;
end;
$$;

create or replace function public.delete_workout_exercise(p_workout_exercise_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.workout_exercises we
  using public.workouts w
  where we.id=p_workout_exercise_id
    and we.workout_id=w.id
    and w.user_id=auth.uid()
    and w.completed_at is null;
  if not found then raise exception 'Exercise not found or workout is already finished'; end if;
end;
$$;

create or replace function public.normalize_workout_sets(p_workout_exercise_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists(
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id=we.workout_id
    where we.id=p_workout_exercise_id and w.user_id=auth.uid() and w.completed_at is null
  ) then raise exception 'Workout exercise not found'; end if;

  with ordered as (
    select id,row_number() over(order by set_number,created_at,id)::integer as rn
    from public.workout_sets
    where workout_exercise_id=p_workout_exercise_id
  )
  update public.workout_sets ws
  set set_number=ordered.rn
  from ordered
  where ws.id=ordered.id;
end;
$$;

create or replace function public.cancel_workout(p_workout_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.workouts
  where id=p_workout_id and user_id=auth.uid() and completed_at is null;
  if not found then raise exception 'Active workout not found'; end if;
end;
$$;

revoke all on function public.start_workout(text,uuid) from public,anon;
revoke all on function public.add_workout_exercise(uuid,uuid,integer) from public,anon;
revoke all on function public.add_workout_set(uuid,integer,integer,numeric,integer,numeric) from public,anon;
revoke all on function public.delete_workout_set(uuid) from public,anon;
revoke all on function public.delete_workout_exercise(uuid) from public,anon;
revoke all on function public.normalize_workout_sets(uuid) from public,anon;
revoke all on function public.cancel_workout(uuid) from public,anon;
grant execute on function public.start_workout(text,uuid) to authenticated;
grant execute on function public.add_workout_exercise(uuid,uuid,integer) to authenticated;
grant execute on function public.add_workout_set(uuid,integer,integer,numeric,integer,numeric) to authenticated;
grant execute on function public.delete_workout_set(uuid) to authenticated;
grant execute on function public.delete_workout_exercise(uuid) to authenticated;
grant execute on function public.normalize_workout_sets(uuid) to authenticated;
grant execute on function public.cancel_workout(uuid) to authenticated;

-- Existing simulated-health hotfix supplied for the current project.
create or replace function public.set_simulated_health(p_enabled boolean)
returns table(id uuid,user_id uuid,provider text,enabled boolean,last_synced_at timestamptz)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.wearable_connections(user_id,provider,enabled,last_synced_at)
  values(auth.uid(),'simulated',coalesce(p_enabled,false),now())
  on conflict(user_id,provider) do update set enabled=excluded.enabled,last_synced_at=excluded.last_synced_at;
  return query
  select w.id,w.user_id,w.provider,w.enabled,w.last_synced_at
  from public.wearable_connections w where w.user_id=auth.uid() and w.provider='simulated';
end;
$$;
revoke all on function public.set_simulated_health(boolean) from public,anon;
grant execute on function public.set_simulated_health(boolean) to authenticated;


-- History RPC: returns the signed-in user's sessions, including in-progress sessions.
create or replace function public.get_my_workout_history(p_limit integer default 50)
returns setof public.workouts
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select w.*
  from public.workouts w
  where auth.uid() is not null and w.user_id=auth.uid()
  order by w.started_at desc
  limit greatest(1, least(100, coalesce(p_limit,50)));
$$;

revoke all on function public.get_my_workout_history(integer) from public,anon;
grant execute on function public.get_my_workout_history(integer) to authenticated;
