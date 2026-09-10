-- Fit Together final migration. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create or replace function public.generate_friend_code() returns text language plpgsql security definer set search_path=public as $$
declare c text; begin loop c=upper(substr(md5(random()::text||clock_timestamp()::text),1,4))||'-'||upper(substr(md5(clock_timestamp()::text||random()::text),1,4)); exit when not exists(select 1 from public.profiles where friend_code=c); end loop; return c; end $$;

create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade);
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists friend_code text;
alter table public.profiles add column if not exists university text;
alter table public.profiles add column if not exists university_verified boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();
update public.profiles set friend_code=public.generate_friend_code() where friend_code is null;
create unique index if not exists profiles_friend_code_uq on public.profiles(friend_code) where friend_code is not null;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,display_name,avatar_url,friend_code) values(new.id,coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,'member'),'@',1)),coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture'),public.generate_friend_code()) on conflict(id) do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Repair helper for users whose auth account predates the profile trigger.
create or replace function public.ensure_my_profile() returns public.profiles
language plpgsql security definer set search_path=public as $$
declare p public.profiles; u record;
begin
  select * into u from auth.users where id=auth.uid();
  if u.id is null then raise exception 'Not authenticated'; end if;
  select * into p from public.profiles where id=auth.uid();
  if p.id is null then
    insert into public.profiles(id,display_name,avatar_url,friend_code)
    values(auth.uid(),coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',split_part(coalesce(u.email,'member'),'@',1)),coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture'),public.generate_friend_code())
    returning * into p;
  end if;
  return p;
end $$;
grant execute on function public.ensure_my_profile() to authenticated;

create table if not exists public.posts(id uuid primary key default gen_random_uuid()); alter table public.posts add column if not exists author_id uuid; alter table public.posts add column if not exists content text; alter table public.posts add column if not exists image_url text; alter table public.posts add column if not exists created_at timestamptz default now(); alter table public.posts add column if not exists updated_at timestamptz default now();
create table if not exists public.comments(id uuid primary key default gen_random_uuid()); alter table public.comments add column if not exists post_id uuid; alter table public.comments add column if not exists author_id uuid; alter table public.comments add column if not exists content text; alter table public.comments add column if not exists created_at timestamptz default now();

create table if not exists public.friendships(id uuid primary key default gen_random_uuid()); alter table public.friendships add column if not exists requester_id uuid; alter table public.friendships add column if not exists receiver_id uuid; alter table public.friendships add column if not exists status text default 'pending'; alter table public.friendships add column if not exists created_at timestamptz default now();
create unique index if not exists friendships_pair_uq on public.friendships(requester_id,receiver_id);

create table if not exists public.groups(id uuid primary key default gen_random_uuid());
alter table public.groups add column if not exists owner_id uuid; alter table public.groups add column if not exists name text; alter table public.groups add column if not exists description text; alter table public.groups add column if not exists join_code text; alter table public.groups add column if not exists created_at timestamptz default now();
do $$ begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='created_by') then execute 'update public.groups set owner_id=created_by where owner_id is null'; end if; if exists(select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='creator_id') then execute 'update public.groups set owner_id=creator_id where owner_id is null'; end if; if exists(select 1 from information_schema.columns where table_schema='public' and table_name='groups' and column_name='user_id') then execute 'update public.groups set owner_id=user_id where owner_id is null'; end if; end $$;
update public.groups set join_code=upper(substr(regexp_replace(coalesce(name,'FIT'),'[^A-Za-z0-9]','','g'),1,6))||'-'||upper(substr(md5(random()::text),1,4)) where join_code is null;
create unique index if not exists groups_join_code_uq on public.groups(join_code) where join_code is not null;
create table if not exists public.group_members(id uuid primary key default gen_random_uuid()); alter table public.group_members add column if not exists group_id uuid; alter table public.group_members add column if not exists user_id uuid; alter table public.group_members add column if not exists created_at timestamptz default now(); create unique index if not exists group_members_uq on public.group_members(group_id,user_id);

create table if not exists public.conversations(id uuid primary key default gen_random_uuid()); alter table public.conversations add column if not exists kind text default 'direct'; alter table public.conversations add column if not exists created_by uuid; alter table public.conversations add column if not exists group_id uuid; alter table public.conversations add column if not exists created_at timestamptz default now();
create table if not exists public.conversation_members(id uuid primary key default gen_random_uuid()); alter table public.conversation_members add column if not exists conversation_id uuid; alter table public.conversation_members add column if not exists user_id uuid; alter table public.conversation_members add column if not exists created_at timestamptz default now(); create unique index if not exists conversation_members_uq on public.conversation_members(conversation_id,user_id);
create table if not exists public.messages(id uuid primary key default gen_random_uuid()); alter table public.messages add column if not exists conversation_id uuid; alter table public.messages add column if not exists sender_id uuid; alter table public.messages add column if not exists content text; alter table public.messages add column if not exists read_at timestamptz; alter table public.messages add column if not exists created_at timestamptz default now(); create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);

create table if not exists public.schedule_events(id uuid primary key default gen_random_uuid()); alter table public.schedule_events add column if not exists creator_id uuid; alter table public.schedule_events add column if not exists group_id uuid; alter table public.schedule_events add column if not exists title text; alter table public.schedule_events add column if not exists event_type text default 'workout'; alter table public.schedule_events add column if not exists location text; alter table public.schedule_events add column if not exists starts_at timestamptz; alter table public.schedule_events add column if not exists ends_at timestamptz; alter table public.schedule_events add column if not exists created_at timestamptz default now(); alter table public.schedule_events add column if not exists calendar_source_id uuid; alter table public.schedule_events add column if not exists external_uid text; create unique index if not exists schedule_external_uq on public.schedule_events(calendar_source_id,external_uid) where calendar_source_id is not null and external_uid is not null;
create table if not exists public.calendar_sources(id uuid primary key default gen_random_uuid()); alter table public.calendar_sources add column if not exists user_id uuid; alter table public.calendar_sources add column if not exists name text; alter table public.calendar_sources add column if not exists url text; alter table public.calendar_sources add column if not exists provider text default 'custom'; alter table public.calendar_sources add column if not exists created_at timestamptz default now();
create table if not exists public.wearable_connections(id uuid primary key default gen_random_uuid()); alter table public.wearable_connections add column if not exists user_id uuid; alter table public.wearable_connections add column if not exists provider text; alter table public.wearable_connections add column if not exists enabled boolean default true; alter table public.wearable_connections add column if not exists access_token text; alter table public.wearable_connections add column if not exists last_synced_at timestamptz; alter table public.wearable_connections add column if not exists metadata jsonb default '{}'::jsonb; create unique index if not exists wearable_user_provider_uq on public.wearable_connections(user_id,provider);

-- =============================================================
-- POINTS, STREAKS, CHALLENGES & SHOP (ported from V3)
-- =============================================================
alter table public.profiles add column if not exists points_balance integer not null default 0;
alter table public.profiles add column if not exists current_streak integer not null default 0;
alter table public.profiles add column if not exists longest_streak integer not null default 0;
alter table public.profiles add column if not exists last_activity_date date;

create table if not exists public.points_ledger(id uuid primary key default gen_random_uuid());
alter table public.points_ledger add column if not exists user_id uuid;
alter table public.points_ledger add column if not exists amount integer not null default 0;
alter table public.points_ledger add column if not exists reason text;
alter table public.points_ledger add column if not exists ref_id uuid;
alter table public.points_ledger add column if not exists created_at timestamptz default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname='points_ledger_user_id_fkey') then
    alter table public.points_ledger add constraint points_ledger_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
exception when duplicate_object then null; end $$;

create or replace function public.award_points(p_user_id uuid, p_amount integer, p_reason text, p_ref_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.points_ledger(user_id,amount,reason,ref_id) values(p_user_id,p_amount,p_reason,p_ref_id);
  update public.profiles set points_balance = points_balance + p_amount where id = p_user_id;
end;
$$;

-- Bumps the daily streak and awards 10 points, at most once per calendar day per user.
create or replace function public.record_daily_activity(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare last_date date; today date := current_date;
begin
  select last_activity_date into last_date from public.profiles where id = p_user_id;
  if last_date = today then return;
  elsif last_date = today - 1 then
    update public.profiles set current_streak = current_streak + 1, longest_streak = greatest(longest_streak, current_streak + 1), last_activity_date = today where id = p_user_id;
  else
    update public.profiles set current_streak = 1, longest_streak = greatest(longest_streak, 1), last_activity_date = today where id = p_user_id;
  end if;
  perform public.award_points(p_user_id, 10, 'daily_activity', null);
end;
$$;

alter table public.points_ledger enable row level security;
drop policy if exists points_ledger_select on public.points_ledger;
create policy points_ledger_select on public.points_ledger for select to authenticated using (auth.uid() = user_id);
create index if not exists points_ledger_user_idx on public.points_ledger(user_id, created_at desc);

create table if not exists public.challenges(id uuid primary key default gen_random_uuid());
alter table public.challenges add column if not exists creator_id uuid;
alter table public.challenges add column if not exists group_id uuid;
alter table public.challenges add column if not exists tier text not null default 'personal'; -- personal | group | university
alter table public.challenges add column if not exists title text;
alter table public.challenges add column if not exists description text;
alter table public.challenges add column if not exists goal_type text default 'workouts'; -- workouts | steps | minutes | streak
alter table public.challenges add column if not exists goal_value integer default 0;
alter table public.challenges add column if not exists points_reward integer not null default 50;
alter table public.challenges add column if not exists start_date date default current_date;
alter table public.challenges add column if not exists end_date date;
alter table public.challenges add column if not exists created_at timestamptz default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname='challenges_creator_id_fkey') then
    alter table public.challenges add constraint challenges_creator_id_fkey foreign key (creator_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='challenges_group_id_fkey') then
    alter table public.challenges add constraint challenges_group_id_fkey foreign key (group_id) references public.groups(id) on delete cascade not valid;
  end if;
exception when duplicate_object then null; end $$;

create table if not exists public.challenge_participants(id uuid primary key default gen_random_uuid());
alter table public.challenge_participants add column if not exists challenge_id uuid;
alter table public.challenge_participants add column if not exists user_id uuid;
alter table public.challenge_participants add column if not exists progress integer not null default 0;
alter table public.challenge_participants add column if not exists completed boolean not null default false;
alter table public.challenge_participants add column if not exists joined_at timestamptz default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname='challenge_participants_challenge_id_fkey') then
    alter table public.challenge_participants add constraint challenge_participants_challenge_id_fkey foreign key (challenge_id) references public.challenges(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='challenge_participants_user_id_fkey') then
    alter table public.challenge_participants add constraint challenge_participants_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
exception when duplicate_object then null; end $$;
create unique index if not exists challenge_participants_unique on public.challenge_participants(challenge_id, user_id);

create or replace function public.bump_challenge_progress(p_challenge_id uuid, p_user_id uuid, p_increment integer)
returns void language plpgsql security definer set search_path=public as $$
declare goal integer; reward integer; new_progress integer; was_completed boolean;
begin
  select goal_value, points_reward into goal, reward from public.challenges where id = p_challenge_id;
  update public.challenge_participants set progress = progress + p_increment where challenge_id = p_challenge_id and user_id = p_user_id returning progress, completed into new_progress, was_completed;
  if new_progress >= goal and not was_completed then
    update public.challenge_participants set completed = true where challenge_id = p_challenge_id and user_id = p_user_id;
    perform public.award_points(p_user_id, coalesce(reward,50), 'challenge_completed', p_challenge_id);
  end if;
  perform public.record_daily_activity(p_user_id);
end;
$$;

alter table public.challenges enable row level security; alter table public.challenge_participants enable row level security;
drop policy if exists challenges_select on public.challenges; drop policy if exists challenges_insert on public.challenges; drop policy if exists challenges_update on public.challenges; drop policy if exists challenges_delete on public.challenges;
drop policy if exists challenge_participants_select on public.challenge_participants; drop policy if exists challenge_participants_insert on public.challenge_participants; drop policy if exists challenge_participants_update on public.challenge_participants;
-- Personal challenges are private; group challenges are visible to group members; university challenges are visible to everyone.
create policy challenges_select on public.challenges for select to authenticated using (
  tier = 'university' or creator_id = auth.uid() or (tier = 'group' and exists(select 1 from public.group_members gm where gm.group_id = challenges.group_id and gm.user_id = auth.uid()))
);
create policy challenges_insert on public.challenges for insert to authenticated with check (auth.uid() = creator_id);
create policy challenges_update on public.challenges for update to authenticated using (auth.uid() = creator_id) with check (auth.uid() = creator_id);
create policy challenges_delete on public.challenges for delete to authenticated using (auth.uid() = creator_id);
create policy challenge_participants_select on public.challenge_participants for select to authenticated using (true);
create policy challenge_participants_insert on public.challenge_participants for insert to authenticated with check (auth.uid() = user_id);
create policy challenge_participants_update on public.challenge_participants for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists challenges_tier_idx on public.challenges(tier);
create index if not exists challenge_participants_challenge_idx on public.challenge_participants(challenge_id);

create table if not exists public.shop_items(id uuid primary key default gen_random_uuid());
alter table public.shop_items add column if not exists name text;
alter table public.shop_items add column if not exists description text;
alter table public.shop_items add column if not exists category text default 'perk';
alter table public.shop_items add column if not exists cost_points integer not null default 100;
alter table public.shop_items add column if not exists stock integer; -- null = unlimited
alter table public.shop_items add column if not exists active boolean not null default true;
alter table public.shop_items add column if not exists created_at timestamptz default now();

create table if not exists public.redemptions(id uuid primary key default gen_random_uuid());
alter table public.redemptions add column if not exists user_id uuid;
alter table public.redemptions add column if not exists item_id uuid;
alter table public.redemptions add column if not exists cost_points integer;
alter table public.redemptions add column if not exists redemption_code text;
alter table public.redemptions add column if not exists created_at timestamptz default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname='redemptions_user_id_fkey') then
    alter table public.redemptions add constraint redemptions_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='redemptions_item_id_fkey') then
    alter table public.redemptions add constraint redemptions_item_id_fkey foreign key (item_id) references public.shop_items(id) on delete cascade not valid;
  end if;
exception when duplicate_object then null; end $$;

-- Atomically spends points, decrements stock, and logs the redemption. Raises (caught by the frontend) on insufficient points/stock.
create or replace function public.redeem_shop_item(p_user_id uuid, p_item_id uuid)
returns public.redemptions language plpgsql security definer set search_path=public as $$
declare item public.shop_items; balance integer; code text; result public.redemptions;
begin
  select * into item from public.shop_items where id = p_item_id and active = true for update;
  if item is null then raise exception 'This item is no longer available.'; end if;
  if item.stock is not null and item.stock <= 0 then raise exception 'This item is out of stock.'; end if;
  select points_balance into balance from public.profiles where id = p_user_id for update;
  if balance < item.cost_points then raise exception 'Not enough points for this item.'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  update public.profiles set points_balance = points_balance - item.cost_points where id = p_user_id;
  insert into public.points_ledger(user_id,amount,reason,ref_id) values(p_user_id, -item.cost_points, 'shop_redemption', p_item_id);
  if item.stock is not null then update public.shop_items set stock = stock - 1 where id = p_item_id; end if;
  insert into public.redemptions(user_id,item_id,cost_points,redemption_code) values(p_user_id,p_item_id,item.cost_points,code) returning * into result;
  return result;
end;
$$;

alter table public.shop_items enable row level security; alter table public.redemptions enable row level security;
drop policy if exists shop_items_select on public.shop_items; drop policy if exists redemptions_select on public.redemptions;
create policy shop_items_select on public.shop_items for select to authenticated using (active = true);
create policy redemptions_select on public.redemptions for select to authenticated using (auth.uid() = user_id);

insert into public.shop_items(name,description,category,cost_points,stock)
select * from (values
  ('Free Protein Shake','Redeem at the campus gym juice bar.','food',150,null::integer),
  ('1 Free Gym Guest Pass','Bring a friend to train with you, on the house.','perk',200,null::integer),
  ('Fit Together Tee','Limited-run training tee.','merch',500,40),
  ('Personal Trainer Session','30-minute 1-on-1 session with a campus trainer.','perk',800,15),
  ('Skip-the-Line Pool Pass','Priority lane access for one week.','perk',300,null::integer),
  ('Fit Together Water Bottle','Insulated 750ml bottle with the logo.','merch',350,60)
) as v(name,description,category,cost_points,stock)
where not exists (select 1 from public.shop_items);

create index if not exists redemptions_user_idx on public.redemptions(user_id, created_at desc);

do $$ begin
  begin alter publication supabase_realtime add table public.challenge_participants; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

alter table public.profiles enable row level security; alter table public.posts enable row level security; alter table public.comments enable row level security; alter table public.friendships enable row level security; alter table public.groups enable row level security; alter table public.group_members enable row level security; alter table public.conversations enable row level security; alter table public.conversation_members enable row level security; alter table public.messages enable row level security; alter table public.schedule_events enable row level security; alter table public.calendar_sources enable row level security; alter table public.wearable_connections enable row level security;

-- Simple non-recursive policies. Drop first so this migration is repeatable.
do $$ declare t text; begin foreach t in array array['profiles','posts','comments','friendships','groups','group_members','conversations','conversation_members','messages','schedule_events','calendar_sources','wearable_connections'] loop execute format('drop policy if exists ft_select on public.%I',t); execute format('drop policy if exists ft_insert on public.%I',t); execute format('drop policy if exists ft_update on public.%I',t); execute format('drop policy if exists ft_delete on public.%I',t); end loop; end $$;
create policy ft_select on public.profiles for select to authenticated using(true); create policy ft_insert on public.profiles for insert to authenticated with check(auth.uid()=id); create policy ft_update on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);
create policy ft_select on public.posts for select to authenticated using(true); create policy ft_insert on public.posts for insert to authenticated with check(auth.uid()=author_id); create policy ft_update on public.posts for update to authenticated using(auth.uid()=author_id) with check(auth.uid()=author_id);
create policy ft_select on public.comments for select to authenticated using(true); create policy ft_insert on public.comments for insert to authenticated with check(auth.uid()=author_id);
create policy ft_select on public.friendships for select to authenticated using(auth.uid()=requester_id or auth.uid()=receiver_id); create policy ft_insert on public.friendships for insert to authenticated with check(auth.uid()=requester_id); create policy ft_update on public.friendships for update to authenticated using(auth.uid()=receiver_id) with check(auth.uid()=receiver_id);
create policy ft_select on public.groups for select to authenticated using(true); create policy ft_insert on public.groups for insert to authenticated with check(auth.uid()=owner_id); create policy ft_update on public.groups for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create policy ft_select on public.group_members for select to authenticated using(true); create policy ft_insert on public.group_members for insert to authenticated with check(auth.uid()=user_id or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
create policy ft_select on public.conversations for select to authenticated using(true); create policy ft_insert on public.conversations for insert to authenticated with check(auth.uid()=created_by);
create policy ft_select on public.conversation_members for select to authenticated using(true); create policy ft_insert on public.conversation_members for insert to authenticated with check(auth.uid()=user_id or exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=auth.uid()));
create policy ft_select on public.messages for select to authenticated using(true); create policy ft_insert on public.messages for insert to authenticated with check(auth.uid()=sender_id); create policy ft_update on public.messages for update to authenticated using(auth.uid()=sender_id or read_at is not null);
create policy ft_select on public.schedule_events for select to authenticated using(true); create policy ft_insert on public.schedule_events for insert to authenticated with check(auth.uid()=creator_id); create policy ft_update on public.schedule_events for update to authenticated using(auth.uid()=creator_id);
create policy ft_select on public.calendar_sources for select to authenticated using(auth.uid()=user_id); create policy ft_insert on public.calendar_sources for insert to authenticated with check(auth.uid()=user_id); create policy ft_update on public.calendar_sources for update to authenticated using(auth.uid()=user_id); create policy ft_delete on public.calendar_sources for delete to authenticated using(auth.uid()=user_id);
create policy ft_select on public.wearable_connections for select to authenticated using(auth.uid()=user_id); create policy ft_insert on public.wearable_connections for insert to authenticated with check(auth.uid()=user_id); create policy ft_update on public.wearable_connections for update to authenticated using(auth.uid()=user_id);

insert into storage.buckets(id,name,public) values('post-media','post-media',true) on conflict(id) do update set public=true;
drop policy if exists ft_storage_insert on storage.objects; drop policy if exists ft_storage_select on storage.objects; drop policy if exists ft_storage_update on storage.objects;
create policy ft_storage_select on storage.objects for select to public using(bucket_id='post-media');
create policy ft_storage_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy ft_storage_update on storage.objects for update to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=auth.uid()::text);

-- Realtime publication is optional; ignore duplicate membership safely.
do $$ begin begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; when undefined_object then null; end; end $$;

-- Safety fix for conversation_members RLS recursion (42P17).
-- This removes any older recursive policies on this table and replaces them
-- with policies that never query conversation_members from inside itself.
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'conversation_members'
  loop
    execute format('drop policy if exists %I on public.conversation_members', p.policyname);
  end loop;
end $$;

create policy conversation_members_select_safe
on public.conversation_members
for select to authenticated
using (user_id = auth.uid());

create policy conversation_members_insert_safe
on public.conversation_members
for insert to authenticated
with check (user_id = auth.uid());

create policy conversation_members_delete_safe
on public.conversation_members
for delete to authenticated
using (user_id = auth.uid());
