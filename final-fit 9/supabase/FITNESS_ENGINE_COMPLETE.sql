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
