-- =============================================================
-- Fit Together — V2 social / challenges / leaderboard migration
-- Run AFTER supabase/FINAL_MIGRATION.sql. Safe to re-run.
--
-- Adds:
--   1. Public Communities (browse / join / leave / community feed)
--   2. Challenge scoping fixes + automatic activity-driven progress
--   3. Group, community and global leaderboards
-- =============================================================
 
-- =============================================================
-- 1. COMMUNITIES
-- =============================================================
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid()
);
alter table public.communities add column if not exists slug text;
alter table public.communities add column if not exists name text;
alter table public.communities add column if not exists description text;
alter table public.communities add column if not exists icon text;
alter table public.communities add column if not exists category text;
alter table public.communities add column if not exists created_at timestamptz not null default now();
-- Must NOT be a partial index: "on conflict (slug)" cannot infer a partial
-- index unless the predicate is repeated in the conflict target. A plain
-- unique index still permits multiple NULLs in Postgres, so nothing is lost.
-- The drop repairs databases where an earlier run created the partial version.
drop index if exists public.communities_slug_uq;
create unique index if not exists communities_slug_uq on public.communities(slug);
 
create table if not exists public.community_members (
  id uuid primary key default gen_random_uuid()
);
alter table public.community_members add column if not exists community_id uuid;
alter table public.community_members add column if not exists user_id uuid;
alter table public.community_members add column if not exists role text not null default 'member';
alter table public.community_members add column if not exists joined_at timestamptz not null default now();
create unique index if not exists community_members_uq on public.community_members(community_id,user_id);
create index if not exists community_members_user_idx on public.community_members(user_id);
 
-- Community posts reuse the existing feed table.
alter table public.posts add column if not exists community_id uuid;
create index if not exists posts_community_idx on public.posts(community_id,created_at desc);
 
do $$
begin
  begin alter table public.community_members add constraint community_members_community_fkey foreign key(community_id) references public.communities(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.community_members add constraint community_members_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.posts add constraint posts_community_fkey foreign key(community_id) references public.communities(id) on delete set null not valid; exception when duplicate_object then null; end;
end $$;
 
insert into public.communities(slug,name,description,icon,category) values
  ('running','Running Community','Road, trail and track runners training together.','🏃','running'),
  ('swimming','Swimming Community','Pool and open-water swimmers.','🏊','swimming'),
  ('basketball','Basketball Community','Pickup games, drills and team training.','🏀','basketball'),
  ('yoga','Yoga Community','Mobility, flexibility and mindful movement.','🧘','yoga'),
  ('cycling','Cycling Community','Road, gravel and indoor cycling.','🚴','cycling'),
  ('strength','Strength Training','Lifting, hypertrophy and powerlifting.','🏋','strength')
on conflict(slug) do update set
  name=excluded.name, description=excluded.description, icon=excluded.icon, category=excluded.category;
 
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
 
drop policy if exists communities_select on public.communities;
drop policy if exists community_members_select on public.community_members;
 
-- Communities are public and discoverable by any signed-in user (spec §15).
create policy communities_select on public.communities for select to authenticated using(true);
create policy community_members_select on public.community_members for select to authenticated using(true);
 
create or replace function public.is_community_member(p_community_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$ select exists(select 1 from public.community_members where community_id=p_community_id and user_id=p_user_id) $$;
 
create or replace function public.join_community(p_community_id uuid)
returns public.community_members
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare m public.community_members;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.communities where id=p_community_id) then raise exception 'Community not found'; end if;
  insert into public.community_members(community_id,user_id)
  values(p_community_id,auth.uid())
  on conflict(community_id,user_id) do update set community_id=excluded.community_id
  returning * into m;
  return m;
end;
$$;
 
create or replace function public.leave_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  delete from public.community_members where community_id=p_community_id and user_id=auth.uid();
end;
$$;
 
-- Overview cards: member count, aggregate member points, and my membership state.
create or replace function public.list_communities()
returns table(
  id uuid, slug text, name text, description text, icon text, category text,
  member_count bigint, total_points bigint, joined boolean
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    c.id, c.slug, c.name, c.description, c.icon, c.category,
    coalesce(m.member_count,0) as member_count,
    coalesce(m.total_points,0) as total_points,
    exists(select 1 from public.community_members x where x.community_id=c.id and x.user_id=auth.uid()) as joined
  from public.communities c
  left join lateral (
    select count(*) as member_count, coalesce(sum(p.points_balance),0) as total_points
    from public.community_members cm
    join public.profiles p on p.id=cm.user_id
    where cm.community_id=c.id
  ) m on true
  order by coalesce(m.member_count,0) desc, c.name;
$$;
 
-- =============================================================
-- 2. CHALLENGES — scoping + automatic progress
-- =============================================================
alter table public.challenges add column if not exists university text;
 
-- Stamp the creator's university so university challenges stay inside that university.
update public.challenges c
set university = p.university
from public.profiles p
where c.creator_id = p.id and c.tier = 'university' and c.university is null;
 
drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges for select to authenticated using(
  creator_id = auth.uid()
  or (tier = 'group' and public.is_group_member(group_id, auth.uid()))
  or (
    tier = 'university'
    and university is not null
    and exists(
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.university_verified = true
        and p.university = challenges.university
    )
  )
);
 
drop policy if exists challenge_participants_select on public.challenge_participants;
create policy challenge_participants_select on public.challenge_participants for select to authenticated using(
  user_id = auth.uid() or exists(
    select 1 from public.challenges c
    where c.id = challenge_id and (
      c.creator_id = auth.uid()
      or (c.tier = 'group' and public.is_group_member(c.group_id, auth.uid()))
      or (c.tier = 'university' and c.university is not null
          and exists(
            select 1 from public.profiles p2
            where p2.id = auth.uid()
              and p2.university_verified = true
              and p2.university = c.university
          ))
    )
  )
);
 
-- Recreate create_challenge so university challenges record their university scope.
create or replace function public.create_challenge(
  p_title text,
  p_description text default null,
  p_tier text default 'personal',
  p_group_id uuid default null,
  p_goal_type text default 'workouts',
  p_goal_value integer default 1,
  p_end_date date default null
)
returns public.challenges
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare c public.challenges; reward integer; created_today integer; my_university text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_title,'')))<2 then raise exception 'Enter a challenge title'; end if;
  if p_tier not in ('personal','group','university') then raise exception 'Invalid challenge tier'; end if;
  if p_goal_type not in ('workouts','steps','minutes','streak') then raise exception 'Invalid goal type'; end if;
  if p_goal_value is null or p_goal_value<1 or p_goal_value>100000 then raise exception 'Invalid goal value'; end if;
  if p_tier='group' and (p_group_id is null or not public.is_group_member(p_group_id,auth.uid())) then raise exception 'Join the group before creating its challenge'; end if;
 
  select university into my_university from public.profiles where id=auth.uid() and university_verified=true;
  if p_tier='university' and coalesce(trim(my_university),'')='' then
    raise exception 'University challenges require a verified university profile';
  end if;
 
  select count(*) into created_today from public.challenges where creator_id=auth.uid() and created_at>=date_trunc('day',now());
  if created_today>=5 then raise exception 'Daily challenge creation limit reached'; end if;
 
  reward := least(150,greatest(20,
    case p_tier when 'personal' then 20 when 'group' then 50 else 75 end
    + least(75,p_goal_value*5)
  ));
 
  insert into public.challenges(creator_id,group_id,tier,title,description,goal_type,goal_value,points_reward,end_date,university)
  values(
    auth.uid(),
    case when p_tier='group' then p_group_id else null end,
    p_tier, trim(p_title), nullif(trim(coalesce(p_description,'')),''),
    p_goal_type, p_goal_value, reward, p_end_date,
    case when p_tier='university' then my_university else null end
  )
  returning * into c;
  return c;
end;
$$;
 
-- Award completion points with the existing daily cap. Internal helper.
create or replace function public.complete_challenge_if_reached(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.challenge_participants; c public.challenges; daily_reward integer; remaining integer;
begin
  select * into p from public.challenge_participants where id=p_participant_id;
  if p.id is null or p.completed then return; end if;
  select * into c from public.challenges where id=p.challenge_id;
  if c.id is null or p.progress < c.goal_value then return; end if;
 
  update public.challenge_participants set completed=true where id=p.id;
 
  select coalesce(sum(amount),0) into daily_reward
  from public.points_ledger
  where user_id=p.user_id and reason='challenge_completed' and created_at>=date_trunc('day',now());
 
  remaining := greatest(0, 200 - daily_reward);
  if remaining > 0 then
    perform public.award_points(p.user_id, least(c.points_reward, remaining), 'challenge_completed', c.id);
  end if;
end;
$$;
 
-- Incremental goals (workouts, minutes) advance from real logged activity.
create or replace function public.advance_challenges(p_user_id uuid, p_goal_type text, p_amount integer)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare r record; touched integer := 0;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then return 0; end if;
  if p_goal_type not in ('workouts','minutes','steps') then return 0; end if;
 
  for r in
    select cp.id as participant_id, cp.progress, c.goal_value
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.user_id = p_user_id
      and cp.completed = false
      and c.goal_type = p_goal_type
      and c.start_date <= current_date
      and (c.end_date is null or c.end_date >= current_date)
  loop
    update public.challenge_participants
    set progress = least(r.goal_value, r.progress + p_amount)
    where id = r.participant_id;
    perform public.complete_challenge_if_reached(r.participant_id);
    touched := touched + 1;
  end loop;
 
  return touched;
end;
$$;
 
-- Absolute goals (streak days) mirror the authoritative profile counter.
create or replace function public.sync_absolute_challenges(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare r record; streak integer; touched integer := 0;
begin
  if p_user_id is null then return 0; end if;
  select coalesce(current_streak,0) into streak from public.profiles where id=p_user_id;
  if streak is null then return 0; end if;
 
  for r in
    select cp.id as participant_id, cp.progress, c.goal_value
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.user_id = p_user_id
      and cp.completed = false
      and c.goal_type = 'streak'
      and c.start_date <= current_date
      and (c.end_date is null or c.end_date >= current_date)
  loop
    if streak > r.progress then
      update public.challenge_participants
      set progress = least(r.goal_value, streak)
      where id = r.participant_id;
      perform public.complete_challenge_if_reached(r.participant_id);
      touched := touched + 1;
    end if;
  end loop;
 
  return touched;
end;
$$;
 
-- Joining is scoped: personal = creator only, group = members, university = same university.
create or replace function public.join_challenge(p_challenge_id uuid)
returns public.challenge_participants
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare c public.challenges; p public.challenge_participants; my_university text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into c from public.challenges where id=p_challenge_id;
  if c.id is null then raise exception 'Challenge not found'; end if;
  if c.tier='personal' and c.creator_id<>auth.uid() then raise exception 'This personal challenge is private'; end if;
  if c.tier='group' and not public.is_group_member(c.group_id,auth.uid()) then raise exception 'Join the group first'; end if;
  if c.tier='university' then
    select university into my_university
    from public.profiles
    where id=auth.uid() and university_verified=true;
    if c.university is null or coalesce(my_university,'') is distinct from c.university then
      raise exception 'Verify your university and join a challenge for that university';
    end if;
  end if;
  insert into public.challenge_participants(challenge_id,user_id)
  values(c.id,auth.uid())
  on conflict(challenge_id,user_id) do update set challenge_id=excluded.challenge_id
  returning * into p;
 
  -- Backfill streak-based goals immediately so the card is not stale on join.
  perform public.sync_absolute_challenges(auth.uid());
  return p;
end;
$$;
 
-- Manual click-to-progress is removed (spec §22). Keep the symbol so old
-- clients fail loudly instead of silently minting progress.
create or replace function public.log_challenge_progress(p_challenge_id uuid,p_increment integer default 1)
returns public.challenge_participants
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  raise exception 'Challenge progress is earned from logged activity and can no longer be set manually.';
end;
$$;
 
create or replace function public.bump_challenge_progress(p_challenge_id uuid,p_user_id uuid,p_increment integer)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  raise exception 'Challenge progress is earned from logged activity and can no longer be set manually.';
end;
$$;
 
-- Verified external activity (Strava/GPS/wearable) also advances workout goals.
create or replace function public.apply_activity(
  p_user_id uuid,
  p_source text,
  p_external_id text default null,
  p_occurred_at timestamptz default now(),
  p_verified boolean default false
)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  user_timezone text := 'UTC';
  activity_day date;
  user_today date;
  pts integer := 0;
  inserted_id uuid;
  last_date date;
begin
  select coalesce(nullif(timezone,''),'UTC') into user_timezone from public.profiles where id=p_user_id;
  begin
    activity_day := (p_occurred_at at time zone user_timezone)::date;
    user_today := (now() at time zone user_timezone)::date;
  exception when invalid_parameter_value then
    user_timezone := 'UTC';
    activity_day := (p_occurred_at at time zone 'UTC')::date;
    user_today := (now() at time zone 'UTC')::date;
  end;
 
  if p_source='self_report' then
    pts := 10;
  elsif p_verified then
    pts := case when activity_day >= user_today-1 and activity_day <= user_today then 50 else 0 end;
  else
    raise exception 'Unsupported activity source';
  end if;
 
  insert into public.activity_log(user_id,activity_date,source,verified,points_awarded,external_id,occurred_at)
  values(p_user_id,activity_day,p_source,p_verified,pts,p_external_id,p_occurred_at)
  on conflict do nothing
  returning id into inserted_id;
 
  if inserted_id is null then return -1; end if;
 
  if pts>0 then perform public.award_points(p_user_id,pts,case when p_verified then 'verified_activity' else 'self_report_activity' end,inserted_id); end if;
 
  select last_activity_date into last_date from public.profiles where id=p_user_id for update;
  if activity_day=user_today and last_date is distinct from user_today then
    if last_date=user_today-1 then
      update public.profiles
      set current_streak=current_streak+1,
          longest_streak=greatest(longest_streak,current_streak+1),
          last_activity_date=user_today,
          updated_at=now()
      where id=p_user_id;
    else
      update public.profiles
      set current_streak=1,
          longest_streak=greatest(longest_streak,1),
          last_activity_date=user_today,
          updated_at=now()
      where id=p_user_id;
    end if;
  end if;
 
  perform public.refresh_group_streaks_for_user(p_user_id,activity_day);
 
  -- A verified external activity is a real session: advance workout-count goals.
  -- Self-reported days do not, because complete_workout already advances per workout.
  if p_verified then perform public.advance_challenges(p_user_id,'workouts',1); end if;
  perform public.sync_absolute_challenges(p_user_id);
 
  return pts;
end;
$$;
 
-- Completing a real workout is what drives challenge progress (spec §41).
create or replace function public.complete_workout(p_workout_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.workouts; total numeric:=0; sets integer:=0; avgrpe numeric; s record; est numeric; oldpr numeric;
        completed_count integer:=0; set_count integer:=0; achievement_id uuid; new_pr boolean:=false;
        first_completion boolean:=false; minutes integer:=0;
begin
  select * into w from public.workouts where id=p_workout_id and user_id=auth.uid() for update;
  if w.id is null then raise exception 'Workout not found'; end if;
  if w.completed_at is null then
    first_completion := true;
    update public.workouts set completed_at=now(),duration_seconds=extract(epoch from (now()-started_at))::int where id=w.id returning * into w;
  end if;
  select coalesce(sum(coalesce(ws.weight,0)*coalesce(ws.reps,0)),0),count(*),avg(ws.rpe) into total,sets,avgrpe
  from public.workout_sets ws join public.workout_exercises we on we.id=ws.workout_exercise_id where we.workout_id=w.id and ws.completed;
  update public.workouts set total_volume=total,total_sets=sets,avg_rpe=avgrpe where id=w.id;
 
  if first_completion then
    insert into public.training_load_daily(user_id,date,load,volume,duration_minutes,sessions)
    values(auth.uid(),(w.completed_at at time zone coalesce((select timezone from public.profiles where id=auth.uid()),'UTC'))::date,
           greatest(1,total/100.0 + coalesce(w.duration_seconds,0)/60.0*0.5),total,coalesce(w.duration_seconds,0)/60.0,1)
    on conflict(user_id,date) do update set load=training_load_daily.load+excluded.load,volume=training_load_daily.volume+excluded.volume,duration_minutes=training_load_daily.duration_minutes+excluded.duration_minutes,sessions=training_load_daily.sessions+1;
    perform public.record_activity('self_report');
 
    -- One completed workout advances every workout/minute goal the user has joined.
    minutes := greatest(0, coalesce(w.duration_seconds,0)/60);
    perform public.advance_challenges(auth.uid(),'workouts',1);
    if minutes > 0 then perform public.advance_challenges(auth.uid(),'minutes',minutes); end if;
    perform public.sync_absolute_challenges(auth.uid());
  end if;
 
  select count(*) into completed_count from public.workouts where user_id=auth.uid() and completed_at is not null;
  select count(*) into set_count from public.workout_sets ws join public.workout_exercises we on we.id=ws.workout_exercise_id join public.workouts ww on ww.id=we.workout_id where ww.user_id=auth.uid() and ws.completed;
  for achievement_id in select a.id from public.achievements a where (a.code='FIRST_WORKOUT' and completed_count>=1) or (a.code='FIVE_WORKOUTS' and completed_count>=5) or (a.code='TEN_SETS' and set_count>=10) loop
    if not exists(select 1 from public.user_achievements ua where ua.user_id=auth.uid() and ua.achievement_id=achievement_id) then
      insert into public.user_achievements(user_id,achievement_id) values(auth.uid(),achievement_id);
      perform public.award_points(auth.uid(),coalesce((select a.points from public.achievements a where a.id=achievement_id),0),'achievement',achievement_id);
    end if;
  end loop;
  for s in select ws.*,we.exercise_id from public.workout_sets ws join public.workout_exercises we on we.id=ws.workout_exercise_id where we.workout_id=w.id and ws.completed and ws.weight is not null and ws.reps is not null loop
    est := s.weight * (1 + s.reps/30.0);
    select value into oldpr from public.personal_records where user_id=auth.uid() and exercise_id=s.exercise_id and record_type='estimated_1rm';
    if oldpr is null or est>oldpr then
      insert into public.personal_records(user_id,exercise_id,record_type,value,workout_set_id,achieved_at) values(auth.uid(),s.exercise_id,'estimated_1rm',est,s.id,coalesce(w.completed_at,now()))
      on conflict(user_id,exercise_id,record_type) do update set value=excluded.value,workout_set_id=excluded.workout_set_id,achieved_at=excluded.achieved_at;
      new_pr := true;
    end if;
  end loop;
  if new_pr and not exists(select 1 from public.user_achievements ua join public.achievements a on a.id=ua.achievement_id where ua.user_id=auth.uid() and a.code='FIRST_PR') then
    select id into achievement_id from public.achievements where code='FIRST_PR';
    if achievement_id is not null then insert into public.user_achievements(user_id,achievement_id) values(auth.uid(),achievement_id); perform public.award_points(auth.uid(),100,'achievement',achievement_id); end if;
  end if;
  return jsonb_build_object('workout_id',w.id,'volume',total,'sets',sets,'duration_seconds',w.duration_seconds,'avg_rpe',avgrpe,'minutes',minutes);
end $$;
 
-- Daily step logs feed step goals.
create or replace function public.sync_step_challenges()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare delta integer;
begin
  if TG_OP = 'INSERT' then
    delta := greatest(0, coalesce(new.steps,0));
  else
    delta := greatest(0, coalesce(new.steps,0) - coalesce(old.steps,0));
  end if;
  if delta > 0 then perform public.advance_challenges(new.user_id,'steps',delta); end if;
  return new;
end;
$$;
 
drop trigger if exists lifestyle_steps_challenge_trg on public.lifestyle_logs;
create trigger lifestyle_steps_challenge_trg
after insert or update of steps on public.lifestyle_logs
for each row execute function public.sync_step_challenges();
 
-- =============================================================
-- 3. LEADERBOARDS
-- =============================================================
create or replace function public.leaderboard_top(
  p_scope text default 'global',
  p_ref_id uuid default null,
  p_period text default 'week',
  p_limit integer default 10
)
returns table(
  user_id uuid, display_name text, avatar_url text,
  points bigint, rank bigint, is_me boolean
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare since timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_scope not in ('global','group','community') then raise exception 'Invalid leaderboard scope'; end if;
  if p_scope='group' then
    if p_ref_id is null or not public.is_group_member(p_ref_id,auth.uid()) then raise exception 'Join the group to see its leaderboard'; end if;
  elsif p_scope='community' then
    if p_ref_id is null or not exists(select 1 from public.communities where id=p_ref_id) then raise exception 'Community not found'; end if;
  end if;
 
  since := case p_period
    when 'week' then date_trunc('week', now())
    when 'month' then date_trunc('month', now())
    else '-infinity'::timestamptz
  end;
 
  return query
  with scoped as (
    select pr.id, pr.display_name, pr.avatar_url
    from public.profiles pr
    where case p_scope
      when 'group' then exists(select 1 from public.group_members gm where gm.group_id=p_ref_id and gm.user_id=pr.id)
      when 'community' then exists(select 1 from public.community_members cm where cm.community_id=p_ref_id and cm.user_id=pr.id)
      else true
    end
  ),
  totals as (
    select s.id, s.display_name, s.avatar_url,
           coalesce((
             select sum(pl.amount) from public.points_ledger pl
             where pl.user_id=s.id and pl.amount>0 and pl.created_at>=since
           ),0)::bigint as pts
    from scoped s
  )
  select t.id, t.display_name, t.avatar_url, t.pts,
         rank() over (order by t.pts desc, t.display_name asc) as rnk,
         (t.id = auth.uid()) as is_me
  from totals t
  where t.pts > 0 or t.id = auth.uid()
  order by rnk
  limit greatest(1, least(50, coalesce(p_limit,10)));
end;
$$;
 
-- =============================================================
-- PRIVILEGES
-- =============================================================
revoke all on table public.communities,public.community_members from public,anon,authenticated;
grant select on public.communities,public.community_members to authenticated;
grant all on table public.communities,public.community_members to service_role;
 
revoke execute on function public.advance_challenges(uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.sync_absolute_challenges(uuid) from public,anon,authenticated;
revoke execute on function public.complete_challenge_if_reached(uuid) from public,anon,authenticated;
revoke execute on function public.apply_activity(uuid,text,text,timestamptz,boolean) from public,anon,authenticated;
revoke execute on function public.is_community_member(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.log_challenge_progress(uuid,integer) from public,anon,authenticated;
revoke execute on function public.bump_challenge_progress(uuid,uuid,integer) from public,anon,authenticated;
 
grant execute on function
  public.join_community(uuid),
  public.leave_community(uuid),
  public.list_communities(),
  public.leaderboard_top(text,uuid,text,integer),
  public.create_challenge(text,text,text,uuid,text,integer,date),
  public.join_challenge(uuid),
  public.complete_workout(uuid)
  to authenticated;
 
-- Communities are readable in the public feed join.
notify pgrst, 'reload schema';