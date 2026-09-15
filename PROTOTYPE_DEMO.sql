-- Fit Together — prototype/demo controls
-- Run AFTER FINAL_MIGRATION.sql, V2_SOCIAL_CHALLENGES.sql and WORKOUT_LOGGING_REPAIR.sql.
-- These controls are intentionally fake/demo-only. They must not be used as a
-- production university verification or anti-cheat mechanism.

create or replace function public.prototype_verify_university(p_university text)
returns public.profiles
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_university,''))) < 2 then raise exception 'Enter a university name'; end if;

  update public.profiles
  set university=left(trim(p_university),160),
      university_verified=true,
      university_verification_requested_at=coalesce(university_verification_requested_at,now()),
      updated_at=now()
  where id=auth.uid()
  returning * into p;

  if p.id is null then raise exception 'Profile not found'; end if;
  return p;
end;
$$;

create or replace function public.prototype_log_challenge_progress(
  p_challenge_id uuid,
  p_increment integer default 1
)
returns public.challenge_participants
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  c public.challenges;
  p public.challenge_participants;
  increment integer;
  progress_points integer;
  daily_demo_points integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  increment := greatest(1, least(10, coalesce(p_increment,1)));

  select * into c from public.challenges where id=p_challenge_id;
  if c.id is null then raise exception 'Challenge not found'; end if;
  if c.end_date is not null and c.end_date < current_date then raise exception 'Challenge has ended'; end if;

  if c.tier='personal' and c.creator_id<>auth.uid() then
    raise exception 'This personal challenge is private';
  end if;
  if c.tier='group' and not public.is_group_member(c.group_id,auth.uid()) then
    raise exception 'Join the group first';
  end if;
  if c.tier='university' and not exists(
    select 1 from public.profiles p2
    where p2.id=auth.uid() and p2.university_verified=true and p2.university=c.university
  ) then
    raise exception 'Verify your university first';
  end if;

  select * into p
  from public.challenge_participants
  where challenge_id=p_challenge_id and user_id=auth.uid()
  for update;
  if p.id is null then raise exception 'Join the challenge first'; end if;
  if p.completed then return p; end if;

  update public.challenge_participants
  set progress=least(c.goal_value,progress+increment)
  where id=p.id
  returning * into p;

  -- Demo points are deliberately small and capped at 50/day.
  select coalesce(sum(amount),0) into daily_demo_points
  from public.points_ledger
  where user_id=auth.uid()
    and reason='prototype_challenge_progress'
    and created_at>=date_trunc('day',now());

  progress_points := greatest(0, least(50-daily_demo_points, increment*5));
  if progress_points > 0 then
    perform public.award_points(auth.uid(),progress_points,'prototype_challenge_progress',c.id);
  end if;

  if p.progress >= c.goal_value and not p.completed then
    update public.challenge_participants set completed=true where id=p.id returning * into p;
  end if;

  return p;
end;
$$;

revoke all on function public.prototype_verify_university(text) from public,anon;
revoke all on function public.prototype_log_challenge_progress(uuid,integer) from public,anon;
grant execute on function public.prototype_verify_university(text) to authenticated;
grant execute on function public.prototype_log_challenge_progress(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
