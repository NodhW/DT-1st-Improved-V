-- Fit Together — production migration
-- Safe to re-run. Existing data is preserved; missing columns/indexes/policies/functions are aligned in place.

create extension if not exists pgcrypto;

-- =============================================================
-- CORE TABLES
-- =============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists university_verified boolean not null default false;
alter table public.profiles add column if not exists university_verification_requested_at timestamptz;
alter table public.profiles add column if not exists timezone text;
alter table public.profiles add column if not exists points_balance integer not null default 0;
alter table public.profiles add column if not exists current_streak integer not null default 0;
alter table public.profiles add column if not exists longest_streak integer not null default 0;
alter table public.profiles add column if not exists last_activity_date date;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
create unique index if not exists profiles_friend_code_uq on public.profiles(friend_code) where friend_code is not null;

-- Safe cross-user profile surface. Sensitive account/progress fields stay on the owner-only base table.
drop view if exists public.profiles_card;
create view public.profiles_card with (security_barrier=true) as
select id,display_name,avatar_url,university,university_verified
from public.profiles;
revoke all on public.profiles_card from public,anon,authenticated;
grant select on public.profiles_card to authenticated;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid()
);
alter table public.posts add column if not exists author_id uuid;
alter table public.posts add column if not exists content text;
alter table public.posts add column if not exists image_url text;
alter table public.posts add column if not exists created_at timestamptz not null default now();
alter table public.posts add column if not exists updated_at timestamptz not null default now();
create index if not exists posts_created_idx on public.posts(created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid()
);
alter table public.comments add column if not exists post_id uuid;
alter table public.comments add column if not exists author_id uuid;
alter table public.comments add column if not exists content text;
alter table public.comments add column if not exists created_at timestamptz not null default now();
create index if not exists comments_post_idx on public.comments(post_id, created_at);

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid()
);
alter table public.post_likes add column if not exists post_id uuid;
alter table public.post_likes add column if not exists user_id uuid;
alter table public.post_likes add column if not exists created_at timestamptz not null default now();
create unique index if not exists post_likes_post_user_uq on public.post_likes(post_id,user_id);
create index if not exists post_likes_post_idx on public.post_likes(post_id);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid()
);
alter table public.friendships add column if not exists requester_id uuid;
alter table public.friendships add column if not exists receiver_id uuid;
alter table public.friendships add column if not exists status text not null default 'pending';
alter table public.friendships add column if not exists created_at timestamptz not null default now();
create unique index if not exists friendships_pair_uq on public.friendships(requester_id,receiver_id);
create index if not exists friendships_receiver_status_idx on public.friendships(receiver_id,status);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid()
);
alter table public.groups add column if not exists owner_id uuid;
alter table public.groups add column if not exists name text;
alter table public.groups add column if not exists description text;
alter table public.groups add column if not exists join_code text;
alter table public.groups add column if not exists created_at timestamptz not null default now();
create unique index if not exists groups_join_code_uq on public.groups(join_code) where join_code is not null;

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid()
);
alter table public.group_members add column if not exists group_id uuid;
alter table public.group_members add column if not exists user_id uuid;
alter table public.group_members add column if not exists created_at timestamptz not null default now();
create unique index if not exists group_members_uq on public.group_members(group_id,user_id);
create index if not exists group_members_user_idx on public.group_members(user_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid()
);
alter table public.conversations add column if not exists kind text not null default 'direct';
alter table public.conversations add column if not exists created_by uuid;
alter table public.conversations add column if not exists group_id uuid;
alter table public.conversations add column if not exists direct_key text;
alter table public.conversations add column if not exists created_at timestamptz not null default now();
create unique index if not exists conversations_group_uq on public.conversations(group_id) where kind='group' and group_id is not null;
create unique index if not exists conversations_direct_key_uq on public.conversations(direct_key) where kind='direct' and direct_key is not null;

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid()
);
alter table public.conversation_members add column if not exists conversation_id uuid;
alter table public.conversation_members add column if not exists user_id uuid;
alter table public.conversation_members add column if not exists last_read_at timestamptz;
alter table public.conversation_members add column if not exists created_at timestamptz not null default now();
create unique index if not exists conversation_members_uq on public.conversation_members(conversation_id,user_id);
create index if not exists conversation_members_user_idx on public.conversation_members(user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid()
);
alter table public.messages add column if not exists conversation_id uuid;
alter table public.messages add column if not exists sender_id uuid;
alter table public.messages add column if not exists content text;
alter table public.messages add column if not exists read_at timestamptz;
alter table public.messages add column if not exists created_at timestamptz not null default now();
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid()
);
alter table public.schedule_events add column if not exists creator_id uuid;
alter table public.schedule_events add column if not exists group_id uuid;
alter table public.schedule_events add column if not exists title text;
alter table public.schedule_events add column if not exists event_type text not null default 'workout';
alter table public.schedule_events add column if not exists location text;
alter table public.schedule_events add column if not exists starts_at timestamptz;
alter table public.schedule_events add column if not exists ends_at timestamptz;
alter table public.schedule_events add column if not exists calendar_source_id uuid;
alter table public.schedule_events add column if not exists external_uid text;
alter table public.schedule_events add column if not exists created_at timestamptz not null default now();
create unique index if not exists schedule_external_uq on public.schedule_events(calendar_source_id,external_uid) where calendar_source_id is not null and external_uid is not null;
create index if not exists schedule_creator_start_idx on public.schedule_events(creator_id,starts_at);
create index if not exists schedule_group_start_idx on public.schedule_events(group_id,starts_at);

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid()
);
alter table public.calendar_sources add column if not exists user_id uuid;
alter table public.calendar_sources add column if not exists name text;
alter table public.calendar_sources add column if not exists url text;
alter table public.calendar_sources add column if not exists provider text not null default 'custom';
alter table public.calendar_sources add column if not exists last_synced_at timestamptz;
alter table public.calendar_sources add column if not exists created_at timestamptz not null default now();
create index if not exists calendar_sources_user_idx on public.calendar_sources(user_id,created_at desc);

create table if not exists public.wearable_connections (
  id uuid primary key default gen_random_uuid()
);
alter table public.wearable_connections add column if not exists user_id uuid;
alter table public.wearable_connections add column if not exists provider text;
alter table public.wearable_connections add column if not exists enabled boolean not null default true;
alter table public.wearable_connections add column if not exists access_token text;
alter table public.wearable_connections add column if not exists last_synced_at timestamptz;
alter table public.wearable_connections add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists wearable_user_provider_uq on public.wearable_connections(user_id,provider);

-- =============================================================
-- POINTS / ACTIVITY / SHARED STREAKS
-- =============================================================
create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid()
);
alter table public.points_ledger add column if not exists user_id uuid;
alter table public.points_ledger add column if not exists amount integer not null default 0;
alter table public.points_ledger add column if not exists reason text;
alter table public.points_ledger add column if not exists ref_id uuid;
alter table public.points_ledger add column if not exists created_at timestamptz not null default now();
create index if not exists points_ledger_user_idx on public.points_ledger(user_id,created_at desc);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid()
);
alter table public.activity_log add column if not exists user_id uuid;
alter table public.activity_log add column if not exists activity_date date;
alter table public.activity_log add column if not exists source text not null default 'self_report';
alter table public.activity_log add column if not exists verified boolean not null default false;
alter table public.activity_log add column if not exists points_awarded integer not null default 0;
alter table public.activity_log add column if not exists external_id text;
alter table public.activity_log add column if not exists occurred_at timestamptz not null default now();
alter table public.activity_log add column if not exists created_at timestamptz not null default now();
create unique index if not exists activity_self_report_daily_uq on public.activity_log(user_id,activity_date) where source='self_report';
create unique index if not exists activity_external_uq on public.activity_log(user_id,source,external_id) where external_id is not null;
create index if not exists activity_user_date_idx on public.activity_log(user_id,activity_date desc);

create table if not exists public.group_streak_days (
  id uuid primary key default gen_random_uuid()
);
alter table public.group_streak_days add column if not exists group_id uuid;
alter table public.group_streak_days add column if not exists activity_date date;
alter table public.group_streak_days add column if not exists completed_at timestamptz not null default now();
create unique index if not exists group_streak_days_uq on public.group_streak_days(group_id,activity_date);

-- =============================================================
-- CHALLENGES / SHOP
-- =============================================================
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid()
);
alter table public.challenges add column if not exists creator_id uuid;
alter table public.challenges add column if not exists group_id uuid;
alter table public.challenges add column if not exists tier text not null default 'personal';
alter table public.challenges add column if not exists title text;
alter table public.challenges add column if not exists description text;
alter table public.challenges add column if not exists goal_type text not null default 'workouts';
alter table public.challenges add column if not exists goal_value integer not null default 1;
alter table public.challenges add column if not exists points_reward integer not null default 50;
alter table public.challenges add column if not exists start_date date not null default current_date;
alter table public.challenges add column if not exists end_date date;
alter table public.challenges add column if not exists created_at timestamptz not null default now();
create index if not exists challenges_tier_idx on public.challenges(tier,created_at desc);

create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid()
);
alter table public.challenge_participants add column if not exists challenge_id uuid;
alter table public.challenge_participants add column if not exists user_id uuid;
alter table public.challenge_participants add column if not exists progress integer not null default 0;
alter table public.challenge_participants add column if not exists completed boolean not null default false;
alter table public.challenge_participants add column if not exists joined_at timestamptz not null default now();
create unique index if not exists challenge_participants_uq on public.challenge_participants(challenge_id,user_id);
create index if not exists challenge_participants_user_idx on public.challenge_participants(user_id);

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid()
);
alter table public.shop_items add column if not exists name text;
alter table public.shop_items add column if not exists description text;
alter table public.shop_items add column if not exists category text;
alter table public.shop_items add column if not exists cost_points integer not null default 100;
alter table public.shop_items add column if not exists stock integer;
alter table public.shop_items add column if not exists active boolean not null default true;
alter table public.shop_items add column if not exists created_at timestamptz not null default now();

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid()
);
alter table public.redemptions add column if not exists user_id uuid;
alter table public.redemptions add column if not exists item_id uuid;
alter table public.redemptions add column if not exists cost_points integer;
alter table public.redemptions add column if not exists redemption_code text;
alter table public.redemptions add column if not exists created_at timestamptz not null default now();
create index if not exists redemptions_user_idx on public.redemptions(user_id,created_at desc);

-- =============================================================
-- INTERNAL HELPERS
-- =============================================================
create or replace function public.generate_friend_code()
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare candidate text;
begin
  loop
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text),1,4)) || '-' || upper(substr(md5(clock_timestamp()::text || random()::text),1,4));
    exit when not exists (select 1 from public.profiles where friend_code=candidate);
  end loop;
  return candidate;
end;
$$;

update public.profiles set friend_code=public.generate_friend_code() where friend_code is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.profiles(id,display_name,username,avatar_url,friend_code,timezone)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',split_part(coalesce(new.email,'member'),'@',1)),
    lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username',split_part(coalesce(new.email,'member'),'@',1)),'[^a-zA-Z0-9_]','','g')) || '_' || substr(replace(new.id::text,'-',''),1,6),
    coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture'),
    public.generate_friend_code(),
    coalesce(new.raw_user_meta_data->>'timezone','UTC')
  ) on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.profiles; u record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into u from auth.users where id=auth.uid();
  if u.id is null then raise exception 'Not authenticated'; end if;
  select * into p from public.profiles where id=auth.uid();
  if p.id is null then
    insert into public.profiles(id,display_name,username,avatar_url,friend_code,timezone)
    values(
      auth.uid(),
      coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',split_part(coalesce(u.email,'member'),'@',1)),
      lower(regexp_replace(split_part(coalesce(u.email,'member'),'@',1),'[^a-zA-Z0-9_]','','g')) || '_' || substr(replace(auth.uid()::text,'-',''),1,6),
      coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),
      public.generate_friend_code(),
      coalesce(u.raw_user_meta_data->>'timezone','UTC')
    ) returning * into p;
  end if;
  return p;
end;
$$;

create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select auth.uid() is not null and p_user_id=auth.uid() and exists(
    select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=auth.uid()
  );
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select auth.uid() is not null and p_user_id=auth.uid() and exists(
    select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=auth.uid()
  );
$$;

create or replace function public.award_points(p_user_id uuid,p_amount integer,p_reason text,p_ref_id uuid default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if p_amount=0 then return; end if;
  insert into public.points_ledger(user_id,amount,reason,ref_id) values(p_user_id,p_amount,p_reason,p_ref_id);
  update public.profiles set points_balance=greatest(0,points_balance+p_amount),updated_at=now() where id=p_user_id;
end;
$$;

create or replace function public.refresh_group_streaks_for_user(p_user_id uuid,p_date date)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare g record;
begin
  for g in select gm.group_id from public.group_members gm where gm.user_id=p_user_id loop
    if exists(select 1 from public.group_members x where x.group_id=g.group_id)
       and not exists(
         select 1
         from public.group_members x
         where x.group_id=g.group_id
           and not exists(
             select 1 from public.activity_log a where a.user_id=x.user_id and a.activity_date=p_date
           )
       ) then
      insert into public.group_streak_days(group_id,activity_date) values(g.group_id,p_date)
      on conflict(group_id,activity_date) do nothing;
    end if;
  end loop;
end;
$$;

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
    -- Verified GPS/wearable activities earn more, but old history imported on first sync does not mint points.
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

  -- Personal streak changes once per activity day. For V1, only today/yesterday are allowed to advance it.
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
  return pts;
end;
$$;

-- =============================================================
-- PUBLIC RPCS
-- =============================================================
create or replace function public.record_activity(p_source text default 'self_report')
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_source,'') not in ('self_report','manual') then raise exception 'Verified sources must be recorded by the server'; end if;
  return greatest(0,public.apply_activity(auth.uid(),'self_report',null,now(),false));
end;
$$;

create or replace function public.record_verified_activity(p_user_id uuid,p_source text,p_external_id text,p_occurred_at timestamptz)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not authorized'; end if;
  if p_user_id is null or p_external_id is null or length(trim(p_external_id))=0 then raise exception 'Missing verified activity identity'; end if;
  if p_source not in ('strava','wearable','gps') then raise exception 'Unsupported verified source'; end if;
  if p_occurred_at > now()+interval '10 minutes' then raise exception 'Activity timestamp is in the future'; end if;
  return public.apply_activity(p_user_id,p_source,p_external_id,p_occurred_at,true);
end;
$$;

-- Legacy compatibility wrappers remain auth-bound and cannot target another user.
create or replace function public.record_daily_activity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Not authorized'; end if;
  perform public.record_activity('self_report');
end;
$$;

create or replace function public.request_university_verification(p_university text)
returns public.profiles
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_university,'')))<2 then raise exception 'Enter your university first'; end if;
  update public.profiles
  set university=trim(p_university),university_verified=false,university_verification_requested_at=now(),updated_at=now()
  where id=auth.uid()
  returning * into p;
  return p;
end;
$$;

create or replace function public.find_profile_by_friend_code(p_friend_code text)
returns table(id uuid,display_name text,avatar_url text,friend_code text,university text,university_verified boolean)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if upper(trim(coalesce(p_friend_code,''))) !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$' then return; end if;
  return query
  select p.id,p.display_name,p.avatar_url,p.friend_code,p.university,p.university_verified
  from public.profiles p
  where upper(p.friend_code)=upper(trim(p_friend_code))
  limit 1;
end;
$$;

create or replace function public.send_friend_request(p_receiver_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare existing public.friendships; r public.friendships; pair_key text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_receiver_id=auth.uid() then raise exception 'You cannot add yourself'; end if;
  if not exists(select 1 from public.profiles where id=p_receiver_id) then raise exception 'Member not found'; end if;

  -- Serialize requests for the same pair so simultaneous A→B/B→A calls cannot create duplicate pending rows.
  pair_key := least(auth.uid()::text,p_receiver_id::text) || ':' || greatest(auth.uid()::text,p_receiver_id::text);
  perform pg_advisory_xact_lock(hashtextextended(pair_key,0));

  select * into existing from public.friendships
  where (requester_id=auth.uid() and receiver_id=p_receiver_id)
     or (requester_id=p_receiver_id and receiver_id=auth.uid())
  order by created_at desc limit 1;

  if existing.id is not null then
    if existing.status in ('accepted','pending') then return existing; end if;
    if existing.status='declined' and existing.requester_id=auth.uid() then
      update public.friendships
      set status='pending',created_at=now()
      where id=existing.id
      returning * into r;
      return r;
    end if;
  end if;

  insert into public.friendships(requester_id,receiver_id,status)
  values(auth.uid(),p_receiver_id,'pending') returning * into r;
  return r;
end;
$$;

create or replace function public.create_group(p_name text,p_description text default null,p_member_ids uuid[] default '{}'::uuid[])
returns public.groups
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  g public.groups;
  c public.conversations;
  candidate text;
  member_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Enter a group name'; end if;

  loop
    candidate := upper(substr(regexp_replace(trim(p_name),'[^A-Za-z0-9]','','g'),1,6));
    if candidate='' then candidate:='FIT'; end if;
    candidate := candidate || '-' || upper(substr(md5(random()::text||clock_timestamp()::text),1,4));
    exit when not exists(select 1 from public.groups where join_code=candidate);
  end loop;

  insert into public.groups(owner_id,name,description,join_code)
  values(auth.uid(),trim(p_name),nullif(trim(coalesce(p_description,'')),''),candidate)
  returning * into g;

  insert into public.group_members(group_id,user_id) values(g.id,auth.uid()) on conflict(group_id,user_id) do nothing;

  foreach member_id in array coalesce(p_member_ids,'{}'::uuid[]) loop
    if member_id=auth.uid() then continue; end if;
    if exists(
      select 1 from public.friendships f
      where f.status='accepted'
        and ((f.requester_id=auth.uid() and f.receiver_id=member_id) or (f.receiver_id=auth.uid() and f.requester_id=member_id))
    ) then
      insert into public.group_members(group_id,user_id) values(g.id,member_id) on conflict(group_id,user_id) do nothing;
    end if;
  end loop;

  insert into public.conversations(kind,created_by,group_id) values('group',auth.uid(),g.id) returning * into c;
  insert into public.conversation_members(conversation_id,user_id)
  select c.id,gm.user_id from public.group_members gm where gm.group_id=g.id
  on conflict(conversation_id,user_id) do nothing;

  return g;
end;
$$;

create or replace function public.join_group_by_code(p_join_code text)
returns public.groups
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare g public.groups; c public.conversations; user_timezone text := 'UTC'; user_today date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select coalesce(nullif(timezone,''),'UTC') into user_timezone from public.profiles where id=auth.uid();
  begin user_today := (now() at time zone user_timezone)::date; exception when invalid_parameter_value then user_today := (now() at time zone 'UTC')::date; end;
  select * into g from public.groups where upper(join_code)=upper(trim(p_join_code)) limit 1;
  if g.id is null then raise exception 'Group code not found'; end if;

  insert into public.group_members(group_id,user_id) values(g.id,auth.uid()) on conflict(group_id,user_id) do nothing;
  delete from public.group_streak_days where group_id=g.id and activity_date=user_today
    and not exists(select 1 from public.activity_log a where a.user_id=auth.uid() and a.activity_date=user_today);
  select * into c from public.conversations where kind='group' and group_id=g.id limit 1;
  if c.id is null then
    insert into public.conversations(kind,created_by,group_id) values('group',coalesce(g.owner_id,auth.uid()),g.id) returning * into c;
    insert into public.conversation_members(conversation_id,user_id)
    select c.id,gm.user_id from public.group_members gm where gm.group_id=g.id
    on conflict(conversation_id,user_id) do nothing;
  else
    insert into public.conversation_members(conversation_id,user_id) values(c.id,auth.uid()) on conflict(conversation_id,user_id) do nothing;
  end if;
  return g;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  g public.groups;
  c_id uuid;
  next_owner uuid;
  user_timezone text := 'UTC';
  user_today date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into g from public.groups where id=p_group_id for update;
  if g.id is null then raise exception 'Group not found'; end if;
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid()) then
    raise exception 'You are not a member of this group';
  end if;

  select coalesce(nullif(timezone,''),'UTC') into user_timezone from public.profiles where id=auth.uid();
  begin user_today := (now() at time zone user_timezone)::date;
  exception when invalid_parameter_value then user_today := (now() at time zone 'UTC')::date; end;

  select id into c_id from public.conversations where kind='group' and group_id=p_group_id limit 1;
  if c_id is not null then
    delete from public.conversation_members where conversation_id=c_id and user_id=auth.uid();
  end if;
  delete from public.group_members where group_id=p_group_id and user_id=auth.uid();

  select gm.user_id into next_owner
  from public.group_members gm
  where gm.group_id=p_group_id
  order by gm.created_at,gm.user_id
  limit 1;

  if next_owner is null then
    delete from public.groups where id=p_group_id;
    return;
  end if;

  if g.owner_id=auth.uid() then
    update public.groups set owner_id=next_owner where id=p_group_id;
  end if;

  delete from public.group_streak_days where group_id=p_group_id and activity_date=user_today;
  perform public.refresh_group_streaks_for_user(next_owner,user_today);
end;
$$;

create or replace function public.get_conversation_members(p_conversation_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select cm.user_id
  from public.conversation_members cm
  where cm.conversation_id=p_conversation_id
    and public.is_conversation_member(p_conversation_id,auth.uid());
$$;

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare cid uuid; dkey text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_other_user_id=auth.uid() then raise exception 'Cannot message yourself'; end if;
  if not exists(
    select 1 from public.friendships f
    where f.status='accepted'
      and ((f.requester_id=auth.uid() and f.receiver_id=p_other_user_id) or (f.receiver_id=auth.uid() and f.requester_id=p_other_user_id))
  ) then raise exception 'Direct messages are available after you become friends'; end if;

  select c.id into cid
  from public.conversations c
  where c.kind='direct'
    and exists(select 1 from public.conversation_members a where a.conversation_id=c.id and a.user_id=auth.uid())
    and exists(select 1 from public.conversation_members b where b.conversation_id=c.id and b.user_id=p_other_user_id)
    and (select count(*) from public.conversation_members z where z.conversation_id=c.id)=2
  order by c.created_at asc limit 1;
  if cid is not null then return cid; end if;

  dkey := least(auth.uid()::text,p_other_user_id::text) || ':' || greatest(auth.uid()::text,p_other_user_id::text);
  begin
    insert into public.conversations(kind,created_by,direct_key) values('direct',auth.uid(),dkey) returning id into cid;
  exception when unique_violation then
    select id into cid from public.conversations where kind='direct' and direct_key=dkey limit 1;
  end;
  insert into public.conversation_members(conversation_id,user_id) values(cid,auth.uid()),(cid,p_other_user_id)
  on conflict(conversation_id,user_id) do nothing;
  return cid;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_conversation_member(p_conversation_id,auth.uid()) then raise exception 'Not authorized'; end if;
  update public.conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=auth.uid();
end;
$$;

create or replace function public.conversation_unread_counts()
returns table(conversation_id uuid,unread_count bigint)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select cm.conversation_id,
         count(m.id)::bigint as unread_count
  from public.conversation_members cm
  left join public.messages m
    on m.conversation_id=cm.conversation_id
   and m.sender_id<>auth.uid()
   and m.created_at>coalesce(cm.last_read_at,'epoch'::timestamptz)
  where cm.user_id=auth.uid()
  group by cm.conversation_id;
$$;

create or replace function public.get_group_busy_blocks(p_group_id uuid,p_day_start timestamptz,p_day_end timestamptz)
returns table(starts_at timestamptz,ends_at timestamptz)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select e.starts_at,coalesce(e.ends_at,e.starts_at+interval '30 minutes')
  from public.schedule_events e
  where public.is_group_member(p_group_id,auth.uid())
    and e.creator_id in (select gm.user_id from public.group_members gm where gm.group_id=p_group_id)
    and e.starts_at<p_day_end
    and coalesce(e.ends_at,e.starts_at+interval '30 minutes')>p_day_start
  order by e.starts_at;
$$;

create or replace function public.group_streak_status(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  total_count integer;
  done_count integer;
  my_done boolean;
  streak_count integer:=0;
  user_timezone text := 'UTC';
  today_local date;
  d date;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id,auth.uid()) then raise exception 'Not authorized'; end if;
  select coalesce(nullif(timezone,''),'UTC') into user_timezone from public.profiles where id=auth.uid();
  begin today_local := (now() at time zone user_timezone)::date; exception when invalid_parameter_value then today_local := (now() at time zone 'UTC')::date; end;
  d := today_local;
  select count(*) into total_count from public.group_members where group_id=p_group_id;
  select count(distinct gm.user_id) into done_count
  from public.group_members gm
  join public.activity_log a on a.user_id=gm.user_id and a.activity_date=today_local
  where gm.group_id=p_group_id;
  select exists(select 1 from public.activity_log where user_id=auth.uid() and activity_date=today_local) into my_done;

  if not exists(select 1 from public.group_streak_days where group_id=p_group_id and activity_date=d) then d:=d-1; end if;
  while exists(select 1 from public.group_streak_days where group_id=p_group_id and activity_date=d) loop
    streak_count:=streak_count+1;
    d:=d-1;
  end loop;

  return jsonb_build_object(
    'group_id',p_group_id,
    'total_members',coalesce(total_count,0),
    'completed_members_today',coalesce(done_count,0),
    'completed_today',coalesce(total_count,0)>0 and done_count=total_count,
    'my_completed_today',coalesce(my_done,false),
    'current_streak',streak_count
  );
end;
$$;

create or replace function public.set_simulated_health(p_enabled boolean)
returns table(id uuid,user_id uuid,provider text,enabled boolean,last_synced_at timestamptz)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
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
declare c public.challenges; reward integer; created_today integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_title,'')))<2 then raise exception 'Enter a challenge title'; end if;
  if p_tier not in ('personal','group','university') then raise exception 'Invalid challenge tier'; end if;
  if p_goal_type not in ('workouts','steps','minutes','streak') then raise exception 'Invalid goal type'; end if;
  if p_goal_value is null or p_goal_value<1 or p_goal_value>100000 then raise exception 'Invalid goal value'; end if;
  if p_tier='group' and (p_group_id is null or not public.is_group_member(p_group_id,auth.uid())) then raise exception 'Join the group before creating its challenge'; end if;
  if p_tier='university' and not exists(select 1 from public.profiles where id=auth.uid() and university_verified=true) then raise exception 'University challenges require a verified university profile'; end if;

  select count(*) into created_today from public.challenges where creator_id=auth.uid() and created_at>=date_trunc('day',now());
  if created_today>=5 then raise exception 'Daily challenge creation limit reached'; end if;

  reward := least(150,greatest(20,
    case p_tier when 'personal' then 20 when 'group' then 50 else 75 end
    + least(75,p_goal_value*5)
  ));

  insert into public.challenges(creator_id,group_id,tier,title,description,goal_type,goal_value,points_reward,end_date)
  values(auth.uid(),case when p_tier='group' then p_group_id else null end,p_tier,trim(p_title),nullif(trim(coalesce(p_description,'')),''),p_goal_type,p_goal_value,reward,p_end_date)
  returning * into c;
  return c;
end;
$$;

create or replace function public.join_challenge(p_challenge_id uuid)
returns public.challenge_participants
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare c public.challenges; p public.challenge_participants;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into c from public.challenges where id=p_challenge_id;
  if c.id is null then raise exception 'Challenge not found'; end if;
  if c.tier='personal' and c.creator_id<>auth.uid() then raise exception 'This personal challenge is private'; end if;
  if c.tier='group' and not public.is_group_member(c.group_id,auth.uid()) then raise exception 'Join the group first'; end if;
  insert into public.challenge_participants(challenge_id,user_id)
  values(c.id,auth.uid())
  on conflict(challenge_id,user_id) do update set challenge_id=excluded.challenge_id
  returning * into p;
  return p;
end;
$$;

create or replace function public.log_challenge_progress(p_challenge_id uuid,p_increment integer default 1)
returns public.challenge_participants
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  c public.challenges;
  p public.challenge_participants;
  daily_reward integer;
  remaining integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_increment,0)<>1 then raise exception 'Progress can be logged one step at a time'; end if;
  select * into c from public.challenges where id=p_challenge_id;
  if c.id is null then raise exception 'Challenge not found'; end if;
  select * into p from public.challenge_participants where challenge_id=p_challenge_id and user_id=auth.uid() for update;
  if p.id is null then raise exception 'Join the challenge first'; end if;
  if p.completed then return p; end if;
  if c.end_date is not null and c.end_date<current_date then raise exception 'Challenge has ended'; end if;

  update public.challenge_participants
  set progress=least(c.goal_value,progress+1)
  where id=p.id
  returning * into p;

  if p.progress>=c.goal_value and not p.completed then
    update public.challenge_participants set completed=true where id=p.id returning * into p;
    select coalesce(sum(amount),0) into daily_reward
    from public.points_ledger
    where user_id=auth.uid() and reason='challenge_completed' and created_at>=date_trunc('day',now());
    remaining:=greatest(0,200-daily_reward);
    if remaining>0 then perform public.award_points(auth.uid(),least(c.points_reward,remaining),'challenge_completed',c.id); end if;
  end if;

  if c.goal_type='workouts' then perform public.apply_activity(auth.uid(),'self_report',null,now(),false); end if;
  return p;
end;
$$;

-- Legacy compatibility wrapper, now auth-bound.
create or replace function public.bump_challenge_progress(p_challenge_id uuid,p_user_id uuid,p_increment integer)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Not authorized'; end if;
  perform public.log_challenge_progress(p_challenge_id,p_increment);
end;
$$;

create or replace function public.redeem_shop_item(p_user_id uuid,p_item_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare item public.shop_items; balance integer; r public.redemptions;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Not authorized'; end if;
  select * into item from public.shop_items where id=p_item_id and active=true for update;
  if item.id is null then raise exception 'This item is no longer available'; end if;
  if item.stock is not null and item.stock<=0 then raise exception 'This item is out of stock'; end if;
  select points_balance into balance from public.profiles where id=p_user_id for update;
  if coalesce(balance,0)<item.cost_points then raise exception 'Not enough points for this item'; end if;

  perform public.award_points(p_user_id,-item.cost_points,'shop_redemption',p_item_id);
  if item.stock is not null then update public.shop_items set stock=stock-1 where id=p_item_id; end if;
  insert into public.redemptions(user_id,item_id,cost_points,redemption_code)
  values(p_user_id,p_item_id,item.cost_points,upper(substr(md5(random()::text||clock_timestamp()::text),1,8)))
  returning * into r;
  return r;
end;
$$;

-- =============================================================
-- RLS
-- =============================================================
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.schedule_events enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.points_ledger enable row level security;
alter table public.activity_log enable row level security;
alter table public.group_streak_days enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.shop_items enable row level security;
alter table public.redemptions enable row level security;

-- Remove every previous policy on managed tables so older broad/recursive policies cannot survive this migration.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'profiles','posts','comments','post_likes','friendships','groups','group_members','conversations',
    'conversation_members','messages','schedule_events','calendar_sources','wearable_connections','points_ledger',
    'activity_log','group_streak_days','challenges','challenge_participants','shop_items','redemptions'
  ] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
  end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create policy posts_select on public.posts for select to authenticated using(true);
create policy posts_insert on public.posts for insert to authenticated with check(author_id=auth.uid());
create policy posts_update on public.posts for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
create policy posts_delete on public.posts for delete to authenticated using(author_id=auth.uid());

create policy comments_select on public.comments for select to authenticated using(true);
create policy comments_insert on public.comments for insert to authenticated with check(author_id=auth.uid());
create policy comments_update on public.comments for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
create policy comments_delete on public.comments for delete to authenticated using(author_id=auth.uid());

create policy post_likes_select on public.post_likes for select to authenticated using(true);
create policy post_likes_insert on public.post_likes for insert to authenticated with check(user_id=auth.uid());
create policy post_likes_delete on public.post_likes for delete to authenticated using(user_id=auth.uid());

create policy friendships_select on public.friendships for select to authenticated using(requester_id=auth.uid() or receiver_id=auth.uid());
create policy friendships_update on public.friendships for update to authenticated using(receiver_id=auth.uid() and status='pending') with check(receiver_id=auth.uid() and status in ('accepted','declined'));

create policy groups_select on public.groups for select to authenticated using(owner_id=auth.uid() or public.is_group_member(id,auth.uid()));
create policy group_members_select on public.group_members for select to authenticated using(user_id=auth.uid() or public.is_group_member(group_id,auth.uid()));

create policy conversations_select on public.conversations for select to authenticated using(public.is_conversation_member(id,auth.uid()));
create policy conversation_members_select on public.conversation_members for select to authenticated using(user_id=auth.uid());

create policy messages_select on public.messages for select to authenticated using(public.is_conversation_member(conversation_id,auth.uid()));
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.is_conversation_member(conversation_id,auth.uid()));

create policy schedule_select on public.schedule_events for select to authenticated using(
  creator_id=auth.uid() or (group_id is not null and public.is_group_member(group_id,auth.uid()))
);
create policy schedule_insert on public.schedule_events for insert to authenticated with check(
  creator_id=auth.uid() and (group_id is null or public.is_group_member(group_id,auth.uid()))
);
create policy schedule_update on public.schedule_events for update to authenticated using(creator_id=auth.uid()) with check(creator_id=auth.uid());
create policy schedule_delete on public.schedule_events for delete to authenticated using(creator_id=auth.uid());

create policy calendar_sources_select on public.calendar_sources for select to authenticated using(user_id=auth.uid());
create policy calendar_sources_insert on public.calendar_sources for insert to authenticated with check(user_id=auth.uid());
create policy calendar_sources_update on public.calendar_sources for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy calendar_sources_delete on public.calendar_sources for delete to authenticated using(user_id=auth.uid());

create policy wearable_select on public.wearable_connections for select to authenticated using(user_id=auth.uid());
create policy points_select on public.points_ledger for select to authenticated using(user_id=auth.uid());
create policy activity_select on public.activity_log for select to authenticated using(user_id=auth.uid());
create policy group_streak_select on public.group_streak_days for select to authenticated using(public.is_group_member(group_id,auth.uid()));

create policy challenges_select on public.challenges for select to authenticated using(
  creator_id=auth.uid() or tier='university' or (tier='group' and public.is_group_member(group_id,auth.uid()))
);
create policy challenge_participants_select on public.challenge_participants for select to authenticated using(
  user_id=auth.uid() or exists(
    select 1 from public.challenges c
    where c.id=challenge_id and (c.tier='university' or c.creator_id=auth.uid() or (c.tier='group' and public.is_group_member(c.group_id,auth.uid())))
  )
);
create policy shop_items_select on public.shop_items for select to authenticated using(active=true);
create policy redemptions_select on public.redemptions for select to authenticated using(user_id=auth.uid());

-- =============================================================
-- PRIVILEGES
-- =============================================================
-- Browser roles must never invoke internal SECURITY DEFINER helpers directly.
revoke execute on function public.generate_friend_code() from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.award_points(uuid,integer,text,uuid) from public,anon,authenticated;
revoke execute on function public.refresh_group_streaks_for_user(uuid,date) from public,anon,authenticated;
revoke execute on function public.apply_activity(uuid,text,text,timestamptz,boolean) from public,anon,authenticated;
revoke execute on function public.record_verified_activity(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_verified_activity(uuid,text,text,timestamptz) to service_role;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that implicit access
-- before granting only the roles each RPC actually needs.
revoke execute on function public.ensure_my_profile() from public,anon,authenticated;
revoke execute on function public.is_group_member(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.is_conversation_member(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.record_activity(text) from public,anon,authenticated;
revoke execute on function public.record_daily_activity(uuid) from public,anon,authenticated;
revoke execute on function public.request_university_verification(text) from public,anon,authenticated;
revoke execute on function public.find_profile_by_friend_code(text) from public,anon,authenticated;
revoke execute on function public.send_friend_request(uuid) from public,anon,authenticated;
revoke execute on function public.create_group(text,text,uuid[]) from public,anon,authenticated;
revoke execute on function public.join_group_by_code(text) from public,anon,authenticated;
revoke execute on function public.leave_group(uuid) from public,anon,authenticated;
revoke execute on function public.get_conversation_members(uuid) from public,anon,authenticated;
revoke execute on function public.get_or_create_direct_conversation(uuid) from public,anon,authenticated;
revoke execute on function public.mark_conversation_read(uuid) from public,anon,authenticated;
revoke execute on function public.conversation_unread_counts() from public,anon,authenticated;
revoke execute on function public.get_group_busy_blocks(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke execute on function public.group_streak_status(uuid) from public,anon,authenticated;
revoke execute on function public.set_simulated_health(boolean) from public,anon,authenticated;
revoke execute on function public.create_challenge(text,text,text,uuid,text,integer,date) from public,anon,authenticated;
revoke execute on function public.join_challenge(uuid) from public,anon,authenticated;
revoke execute on function public.log_challenge_progress(uuid,integer) from public,anon,authenticated;
revoke execute on function public.bump_challenge_progress(uuid,uuid,integer) from public,anon,authenticated;
revoke execute on function public.redeem_shop_item(uuid,uuid) from public,anon,authenticated;

grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.is_group_member(uuid,uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid,uuid) to authenticated;
grant execute on function public.record_activity(text) to authenticated;
grant execute on function public.record_daily_activity(uuid) to authenticated;
grant execute on function public.request_university_verification(text) to authenticated;
grant execute on function public.find_profile_by_friend_code(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.create_group(text,text,uuid[]) to authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.get_conversation_members(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.conversation_unread_counts() to authenticated;
grant execute on function public.get_group_busy_blocks(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.group_streak_status(uuid) to authenticated;
grant execute on function public.set_simulated_health(boolean) to authenticated;
grant execute on function public.create_challenge(text,text,text,uuid,text,integer,date) to authenticated;
grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.log_challenge_progress(uuid,integer) to authenticated;
grant execute on function public.bump_challenge_progress(uuid,uuid,integer) to authenticated;
grant execute on function public.redeem_shop_item(uuid,uuid) to authenticated;

-- Define browser table privileges explicitly instead of relying on Supabase/Postgres defaults.
-- Anonymous users receive no application-table access; RLS is then a second layer for signed-in users.
revoke all on table
  public.profiles,public.posts,public.comments,public.post_likes,public.friendships,
  public.groups,public.group_members,public.conversations,public.conversation_members,public.messages,
  public.schedule_events,public.calendar_sources,public.wearable_connections,public.points_ledger,
  public.activity_log,public.group_streak_days,public.challenges,public.challenge_participants,
  public.shop_items,public.redemptions
from public,anon,authenticated;

revoke all on public.profiles_card from public,anon,authenticated;
grant select on public.profiles_card to authenticated;

grant select on public.profiles to authenticated;
grant update(display_name,username,avatar_url,timezone,updated_at) on public.profiles to authenticated;

grant select,insert,update,delete on public.posts to authenticated;
grant select,insert,update,delete on public.comments to authenticated;
grant select,insert,delete on public.post_likes to authenticated;
grant select,update on public.friendships to authenticated;
grant select on public.groups,public.group_members to authenticated;
grant select on public.conversations,public.conversation_members to authenticated;
grant select,insert on public.messages to authenticated;
grant select,insert,update,delete on public.schedule_events to authenticated;
grant select,insert,update,delete on public.calendar_sources to authenticated;
grant select on public.points_ledger,public.activity_log,public.group_streak_days to authenticated;
grant select on public.challenges,public.challenge_participants,public.shop_items,public.redemptions to authenticated;

-- Wearable OAuth secrets are server-only. Browser clients can only read non-secret connection state.
grant select(id,user_id,provider,enabled,last_synced_at) on public.wearable_connections to authenticated;

-- Netlify's service-role requests need full application-table privileges and still keep secrets server-side.
grant all on table
  public.profiles,public.posts,public.comments,public.post_likes,public.friendships,
  public.groups,public.group_members,public.conversations,public.conversation_members,public.messages,
  public.schedule_events,public.calendar_sources,public.wearable_connections,public.points_ledger,
  public.activity_log,public.group_streak_days,public.challenges,public.challenge_participants,
  public.shop_items,public.redemptions
  to service_role;

-- =============================================================
-- STORAGE / REALTIME / SEED DATA
-- =============================================================
insert into storage.buckets(id,name,public) values('post-media','post-media',true)
on conflict(id) do update set public=true;

do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'fit_together_%' loop
    execute format('drop policy if exists %I on storage.objects',p.policyname);
  end loop;
end $$;
create policy fit_together_media_select on storage.objects for select to public using(bucket_id='post-media');
create policy fit_together_media_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy fit_together_media_update on storage.objects for update to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy fit_together_media_delete on storage.objects for delete to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);

do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

insert into public.shop_items(name,description,category,cost_points,stock,active)
select * from (values
  ('Recovery Smoothie','One partner recovery smoothie','food',150,100,true),
  ('Guest Gym Pass','Single guest gym pass','fitness',300,50,true),
  ('Fit Together Bottle','Reusable Fit Together bottle','merch',500,25,true),
  ('Campus Café Credit','Small campus café reward','food',650,30,true),
  ('Training Band','Light resistance band','fitness',800,20,true),
  ('Premium Challenge Badge','Limited profile reward','digital',1000,null,true)
) as seed(name,description,category,cost_points,stock,active)
where not exists(select 1 from public.shop_items s where lower(s.name)=lower(seed.name));

-- Optional FK alignment. NOT VALID preserves existing legacy rows while protecting new ones.
do $$
begin
  begin alter table public.posts add constraint posts_author_fkey foreign key(author_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.comments add constraint comments_post_fkey foreign key(post_id) references public.posts(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.comments add constraint comments_author_fkey foreign key(author_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.post_likes add constraint post_likes_post_fkey foreign key(post_id) references public.posts(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.post_likes add constraint post_likes_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.group_members add constraint group_members_group_fkey foreign key(group_id) references public.groups(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.group_members add constraint group_members_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.conversation_members add constraint conversation_members_conversation_fkey foreign key(conversation_id) references public.conversations(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.conversation_members add constraint conversation_members_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.messages add constraint messages_conversation_fkey foreign key(conversation_id) references public.conversations(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.messages add constraint messages_sender_fkey foreign key(sender_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.points_ledger add constraint points_ledger_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.activity_log add constraint activity_log_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.group_streak_days add constraint group_streak_days_group_fkey foreign key(group_id) references public.groups(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.challenge_participants add constraint challenge_participants_challenge_fkey foreign key(challenge_id) references public.challenges(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.challenge_participants add constraint challenge_participants_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.redemptions add constraint redemptions_item_fkey foreign key(item_id) references public.shop_items(id) on delete restrict not valid; exception when duplicate_object then null; end;
  begin alter table public.redemptions add constraint redemptions_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;

  -- Additional relationship integrity for legacy-aligned tables. NOT VALID preserves old rows while enforcing new writes.
  begin alter table public.friendships add constraint friendships_requester_fkey foreign key(requester_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.friendships add constraint friendships_receiver_fkey foreign key(receiver_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.groups add constraint groups_owner_fkey foreign key(owner_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.conversations add constraint conversations_created_by_fkey foreign key(created_by) references public.profiles(id) on delete set null not valid; exception when duplicate_object then null; end;
  begin alter table public.conversations add constraint conversations_group_fkey foreign key(group_id) references public.groups(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.schedule_events add constraint schedule_creator_fkey foreign key(creator_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.schedule_events add constraint schedule_group_fkey foreign key(group_id) references public.groups(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.schedule_events add constraint schedule_calendar_source_fkey foreign key(calendar_source_id) references public.calendar_sources(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.calendar_sources add constraint calendar_sources_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.wearable_connections add constraint wearable_connections_user_fkey foreign key(user_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.challenges add constraint challenges_creator_fkey foreign key(creator_id) references public.profiles(id) on delete cascade not valid; exception when duplicate_object then null; end;
  begin alter table public.challenges add constraint challenges_group_fkey foreign key(group_id) references public.groups(id) on delete cascade not valid; exception when duplicate_object then null; end;
end $$;

-- Enforce valid values on new writes without rejecting unknown legacy rows during migration.
do $$
begin
  begin alter table public.friendships add constraint friendships_status_check check(status in ('pending','accepted','declined')) not valid; exception when duplicate_object then null; end;
  begin alter table public.conversations add constraint conversations_kind_check check(kind in ('direct','group')) not valid; exception when duplicate_object then null; end;
  begin alter table public.challenges add constraint challenges_tier_check check(tier in ('personal','group','university')) not valid; exception when duplicate_object then null; end;
  begin alter table public.challenges add constraint challenges_goal_value_check check(goal_value > 0) not valid; exception when duplicate_object then null; end;
  begin alter table public.shop_items add constraint shop_items_cost_check check(cost_points >= 0) not valid; exception when duplicate_object then null; end;
  begin alter table public.shop_items add constraint shop_items_stock_check check(stock is null or stock >= 0) not valid; exception when duplicate_object then null; end;
end $$;
-- Fit Together — complete fitness engine expansion
create extension if not exists pgcrypto;

create table if not exists public.fitness_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goal text not null default 'general_fitness',
  experience text not null default 'beginner',
  training_days integer not null default 3,
  session_minutes integer not null default 45,
  equipment jsonb not null default '[]'::jsonb,
  preferred_training text not null default 'strength',
  injuries_notes text,
  unit text not null default 'kg',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'strength',
  muscle_groups text[] not null default '{}',
  equipment text[] not null default '{}',
  movement_pattern text,
  instructions text,
  is_time_based boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists exercises_name_uq on public.exercises(lower(name));

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  goal text,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists training_plans_user_idx on public.training_plans(user_id,active);

create table if not exists public.plan_workouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  weekday integer not null check(weekday between 0 and 6),
  title text not null,
  focus text,
  duration_minutes integer not null default 45,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_workout_id uuid not null references public.plan_workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  position integer not null default 0,
  target_sets integer not null default 3,
  target_reps integer,
  target_weight numeric,
  target_rpe numeric,
  rest_seconds integer not null default 90,
  notes text
);
create index if not exists plan_exercises_workout_idx on public.plan_exercises(plan_workout_id,position);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_workout_id uuid references public.plan_workouts(id) on delete set null,
  title text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds integer,
  notes text,
  total_volume numeric not null default 0,
  total_sets integer not null default 0,
  avg_rpe numeric,
  created_at timestamptz not null default now()
);
create index if not exists workouts_user_date_idx on public.workouts(user_id,started_at desc);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null default 0,
  notes text
);
create index if not exists workout_exercises_workout_idx on public.workout_exercises(workout_id,position);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null,
  reps integer,
  weight numeric,
  duration_seconds integer,
  rpe numeric,
  completed boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists workout_sets_exercise_idx on public.workout_sets(workout_exercise_id,set_number);

create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  record_type text not null,
  value numeric not null,
  workout_set_id uuid references public.workout_sets(id) on delete set null,
  achieved_at timestamptz not null default now()
);
create unique index if not exists personal_records_uq on public.personal_records(user_id,exercise_id,record_type);

create table if not exists public.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  sleep_hours numeric,
  sleep_quality integer,
  soreness integer,
  stress integer,
  energy integer,
  hrv numeric,
  resting_hr numeric,
  readiness integer,
  recommendation text,
  source text not null default 'self_report',
  created_at timestamptz not null default now()
);
create unique index if not exists recovery_logs_user_date_uq on public.recovery_logs(user_id,date);

create table if not exists public.training_load_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  load numeric not null default 0,
  volume numeric not null default 0,
  duration_minutes numeric not null default 0,
  sessions integer not null default 0,
  primary key(user_id,date)
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text not null,
  icon text,
  points integer not null default 0
);
create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key(user_id,achievement_id)
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  calories integer,
  water_ml integer,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists nutrition_logs_user_date_uq on public.nutrition_logs(user_id,date);
create table if not exists public.lifestyle_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  sleep_hours numeric,
  water_ml integer,
  steps integer,
  mood integer,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists lifestyle_logs_user_date_uq on public.lifestyle_logs(user_id,date);
alter table public.nutrition_logs enable row level security;
alter table public.lifestyle_logs enable row level security;
drop policy if exists fit_nutrition_owner on public.nutrition_logs;
drop policy if exists fit_lifestyle_owner on public.lifestyle_logs;
create policy fit_nutrition_owner on public.nutrition_logs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_lifestyle_owner on public.lifestyle_logs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table public.fitness_profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.training_plans enable row level security;
alter table public.plan_workouts enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.personal_records enable row level security;
alter table public.recovery_logs enable row level security;
alter table public.training_load_daily enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

do $$ declare t text; begin
  foreach t in array array['fitness_profiles','training_plans','workouts','recovery_logs','training_load_daily','user_achievements'] loop
    execute format('drop policy if exists fit_owner_select on public.%I',t);
    execute format('drop policy if exists fit_owner_insert on public.%I',t);
    execute format('drop policy if exists fit_owner_update on public.%I',t);
    execute format('drop policy if exists fit_owner_delete on public.%I',t);
  end loop;
end $$;

drop policy if exists fit_owner_select on public.fitness_profiles;
drop policy if exists fit_owner_insert on public.fitness_profiles;
drop policy if exists fit_owner_update on public.fitness_profiles;
drop policy if exists fit_owner_delete on public.fitness_profiles;
drop policy if exists fit_exercises_read on public.exercises;
drop policy if exists fit_plans_owner on public.training_plans;
drop policy if exists fit_plan_workouts_owner on public.plan_workouts;
drop policy if exists fit_plan_exercises_owner on public.plan_exercises;
drop policy if exists fit_workouts_owner on public.workouts;
drop policy if exists fit_workout_exercises_owner on public.workout_exercises;
drop policy if exists fit_sets_owner on public.workout_sets;
drop policy if exists fit_pr_owner on public.personal_records;
drop policy if exists fit_recovery_owner on public.recovery_logs;
drop policy if exists fit_load_owner on public.training_load_daily;
drop policy if exists fit_achievements_read on public.achievements;
drop policy if exists fit_user_achievements_read on public.user_achievements;

create policy fit_owner_select on public.fitness_profiles for select to authenticated using(user_id=auth.uid());
create policy fit_owner_insert on public.fitness_profiles for insert to authenticated with check(user_id=auth.uid());
create policy fit_owner_update on public.fitness_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_owner_delete on public.fitness_profiles for delete to authenticated using(user_id=auth.uid());
create policy fit_exercises_read on public.exercises for select to authenticated using(true);
create policy fit_plans_owner on public.training_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_plan_workouts_owner on public.plan_workouts for all to authenticated using(exists(select 1 from public.training_plans p where p.id=plan_id and p.user_id=auth.uid())) with check(exists(select 1 from public.training_plans p where p.id=plan_id and p.user_id=auth.uid()));
create policy fit_plan_exercises_owner on public.plan_exercises for all to authenticated using(exists(select 1 from public.plan_workouts w join public.training_plans p on p.id=w.plan_id where w.id=plan_workout_id and p.user_id=auth.uid())) with check(exists(select 1 from public.plan_workouts w join public.training_plans p on p.id=w.plan_id where w.id=plan_workout_id and p.user_id=auth.uid()));
create policy fit_workouts_owner on public.workouts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_workout_exercises_owner on public.workout_exercises for all to authenticated using(exists(select 1 from public.workouts w where w.id=workout_id and w.user_id=auth.uid())) with check(exists(select 1 from public.workouts w where w.id=workout_id and w.user_id=auth.uid()));
create policy fit_sets_owner on public.workout_sets for all to authenticated using(exists(select 1 from public.workout_exercises we join public.workouts w on w.id=we.workout_id where we.id=workout_exercise_id and w.user_id=auth.uid())) with check(exists(select 1 from public.workout_exercises we join public.workouts w on w.id=we.workout_id where we.id=workout_exercise_id and w.user_id=auth.uid()));
create policy fit_pr_owner on public.personal_records for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_recovery_owner on public.recovery_logs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_load_owner on public.training_load_daily for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fit_achievements_read on public.achievements for select to authenticated using(true);
create policy fit_user_achievements_read on public.user_achievements for select to authenticated using(user_id=auth.uid());

insert into public.exercises(name,category,muscle_groups,equipment,movement_pattern,instructions) values
('Barbell Back Squat','strength',array['quads','glutes','core'],array['barbell','rack'],'squat','Brace, squat to a controlled depth, drive through the floor.'),
('Bench Press','strength',array['chest','triceps','shoulders'],array['barbell','bench'],'push','Keep shoulder blades set and press evenly.'),
('Deadlift','strength',array['hamstrings','glutes','back','core'],array['barbell'],'hinge','Brace, hinge at the hips and keep the bar close.'),
('Overhead Press','strength',array['shoulders','triceps','core'],array['barbell'],'push','Press overhead without excessive lower-back extension.'),
('Barbell Row','strength',array['back','biceps'],array['barbell'],'pull','Hinge and pull toward the lower ribs.'),
('Lat Pulldown','strength',array['lats','biceps'],array['cable'],'pull','Pull elbows down and control the return.'),
('Dumbbell Lunge','strength',array['quads','glutes','hamstrings'],array['dumbbells'],'lunge','Step forward and lower under control.'),
('Romanian Deadlift','strength',array['hamstrings','glutes','back'],array['barbell'],'hinge','Push hips back while maintaining a neutral spine.'),
('Plank','core',array['core'],array[],'brace','Maintain a straight line and steady breathing.'),
('Push-Up','strength',array['chest','triceps','shoulders','core'],array[],'push','Keep the body rigid and lower under control.'),
('Running','cardio',array['cardio','legs'],array[],'locomotion','Run at the selected intensity.'),
('Cycling','cardio',array['cardio','quads','glutes'],array['bike'],'locomotion','Ride at the selected intensity.')
on conflict(lower(name)) do nothing;

insert into public.achievements(code,name,description,icon,points) values
('FIRST_WORKOUT','First Workout','Complete your first logged workout.','dumbbell',25),
('FIVE_WORKOUTS','Five Workouts','Complete five workouts.','flame',75),
('TEN_SETS','Set Builder','Complete 10 strength sets.','zap',50),
('FIRST_PR','Personal Best','Set your first personal record.','trophy',100),
('SEVEN_DAY_STREAK','One Week Strong','Maintain a 7-day activity streak.','flame',150),
('GROUP_STREAK','Crew Locked In','Complete a full group participation day.','users',100)
on conflict(code) do nothing;

create or replace function public.fitness_readiness_score(p_user_id uuid, p_date date default current_date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; load7 numeric:=0; score integer:=65; rec text:='Ready'; begin
 if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Not authorized'; end if;
 select * into r from public.recovery_logs where user_id=p_user_id and date=p_date;
 select coalesce(sum(load),0) into load7 from public.training_load_daily where user_id=p_user_id and date between p_date-6 and p_date;
 if r.id is not null then
   score := round((coalesce(r.sleep_quality,6)*10 + coalesce(r.energy,6)*10 + (10-coalesce(r.soreness,4))*10 + (10-coalesce(r.stress,4))*10)/4.0);
   score := greatest(5,least(95,score));
 end if;
 if load7>1000 or coalesce(r.soreness,0)>=8 or coalesce(r.sleep_quality,10)<=3 then rec:='Recover';
 elsif load7>650 or coalesce(r.energy,10)<=5 then rec:='Pace Yourself';
 elsif score>=80 then rec:='Go For It';
 end if;
 return jsonb_build_object('score',score,'recommendation',rec,'load_7d',load7,'sleep_quality',coalesce(r.sleep_quality,null),'energy',coalesce(r.energy,null),'soreness',coalesce(r.soreness,null),'stress',coalesce(r.stress,null));
end $$;

create or replace function public.complete_workout(p_workout_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.workouts; total numeric:=0; sets integer:=0; avgrpe numeric; s record; est numeric; oldpr numeric; completed_count integer:=0; set_count integer:=0; achievement_id uuid; new_pr boolean:=false; begin
 select * into w from public.workouts where id=p_workout_id and user_id=auth.uid() for update;
 if w.id is null then raise exception 'Workout not found'; end if;
 if w.completed_at is null then
   update public.workouts set completed_at=now(),duration_seconds=extract(epoch from (now()-started_at))::int where id=w.id returning * into w;
 end if;
 select coalesce(sum(coalesce(ws.weight,0)*coalesce(ws.reps,0)),0),count(*),avg(ws.rpe) into total,sets,avgrpe
 from public.workout_sets ws join public.workout_exercises we on we.id=ws.workout_exercise_id where we.workout_id=w.id and ws.completed;
 update public.workouts set total_volume=total,total_sets=sets,avg_rpe=avgrpe where id=w.id;
 insert into public.training_load_daily(user_id,date,load,volume,duration_minutes,sessions) values(auth.uid(),(w.completed_at at time zone coalesce((select timezone from public.profiles where id=auth.uid()),'UTC'))::date,greatest(1,total/100.0 + coalesce(w.duration_seconds,0)/60.0*0.5),total,coalesce(w.duration_seconds,0)/60.0,1)
 on conflict(user_id,date) do update set load=training_load_daily.load+excluded.load,volume=training_load_daily.volume+excluded.volume,duration_minutes=training_load_daily.duration_minutes+excluded.duration_minutes,sessions=training_load_daily.sessions+1;
 perform public.record_activity('self_report');
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
 return jsonb_build_object('workout_id',w.id,'volume',total,'sets',sets,'duration_seconds',w.duration_seconds,'avg_rpe',avgrpe);
end $$;

-- Tighten existing points/activity functions against arbitrary user IDs.
revoke execute on function public.award_points(uuid,integer,text,uuid) from anon,authenticated;
revoke execute on function public.record_verified_activity(uuid,text,text,timestamptz) from anon,authenticated;
revoke execute on function public.ensure_my_profile() from anon;
revoke execute on function public.generate_friend_code() from anon,authenticated;

-- service role / authenticated grants
revoke all on public.fitness_profiles,public.training_plans,public.plan_workouts,public.plan_exercises,public.workouts,public.workout_exercises,public.workout_sets,public.personal_records,public.recovery_logs,public.training_load_daily,public.achievements,public.user_achievements,public.exercises,public.nutrition_logs,public.lifestyle_logs from public,anon;
grant select,insert,update,delete on public.fitness_profiles,public.training_plans,public.plan_workouts,public.plan_exercises,public.workouts,public.workout_exercises,public.workout_sets,public.personal_records,public.recovery_logs,public.training_load_daily,public.user_achievements,public.nutrition_logs,public.lifestyle_logs to authenticated;
grant select on public.exercises,public.achievements to authenticated;
grant all on public.fitness_profiles,public.training_plans,public.plan_workouts,public.plan_exercises,public.workouts,public.workout_exercises,public.workout_sets,public.personal_records,public.recovery_logs,public.training_load_daily,public.achievements,public.user_achievements,public.exercises,public.nutrition_logs,public.lifestyle_logs to service_role;
grant execute on function public.fitness_readiness_score(uuid,date),public.complete_workout(uuid) to authenticated;
