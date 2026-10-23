-- ===========================================================================
-- Narsil — quiz competition levels (score-only ladder)
-- ---------------------------------------------------------------------------
-- Extends quiz_progress with total_points + level_id.
-- Stores one daily row in quiz_daily_scores for same-level leaderboards.
--
-- Economy (client + RPCs must agree):
--   Level thresholds: 0, 1000, 3000, 9000, 27000, 81000, 243000
--   (seven person levels; display as 1–7)
--   Missed calendar day: −100 points (floor 0), then recompute level
--   Rankings: same level_id, ordered by today's points (display only)
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run. Safe to re-run.
--   Requires quiz-progress.sql first.
-- ===========================================================================

-- ── Columns on quiz_progress ───────────────────────────────────────────────

alter table public.quiz_progress
  add column if not exists total_points integer not null default 0;

alter table public.quiz_progress
  add column if not exists level_id integer not null default 0;

alter table public.quiz_progress
  add column if not exists last_daily_points integer;

alter table public.quiz_progress
  add column if not exists absence_applied_through date;

-- ── Daily competition rows ─────────────────────────────────────────────────

create table if not exists public.quiz_daily_scores (
  user_id       uuid not null references auth.users(id) on delete cascade,
  play_date     date not null,
  points        integer not null default 0,
  correct_count integer not null default 0,
  total_count   integer not null default 0,
  level_id      integer not null default 0,
  finished_at   timestamptz not null default now(),
  primary key (user_id, play_date)
);

create index if not exists quiz_daily_scores_level_day_pts
  on public.quiz_daily_scores (play_date, level_id, points desc, finished_at asc);

alter table public.quiz_daily_scores enable row level security;

drop policy if exists "Users manage their own daily quiz scores" on public.quiz_daily_scores;
create policy "Users manage their own daily quiz scores"
  on public.quiz_daily_scores for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.quiz_level_from_points(pts integer)
returns integer
language sql
immutable
as $$
  select case
    when pts >= 243000 then 6
    when pts >= 81000  then 5
    when pts >= 27000  then 4
    when pts >= 9000   then 3
    when pts >= 3000   then 2
    when pts >= 1000   then 1
    else 0
  end;
$$;

-- Drop prior signatures if re-running after an earlier draft.
drop function if exists public.submit_daily_quiz_result(integer, integer, integer);
drop function if exists public.submit_daily_quiz_result(integer, integer, integer, date);
drop function if exists public.quiz_level_board();
drop function if exists public.quiz_level_board(date);
drop function if exists public.tick_quiz_absence();

-- ── submit_daily_quiz_result ───────────────────────────────────────────────
-- Upserts today's score. Adds points to total only on first complete of the day
-- (replay updates the daily row + display fields without double-counting).

create or replace function public.submit_daily_quiz_result(
  p_points integer,
  p_correct integer,
  p_total integer,
  p_play_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := coalesce(p_play_date, (timezone('utc', now()))::date);
  prev_points integer := 0;
  prev_level integer := 0;
  new_total integer;
  new_level integer;
  leveled_up boolean := false;
  leveled_down boolean := false;
  already boolean := false;
  old_daily integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.quiz_progress (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select total_points, level_id into prev_points, prev_level
  from public.quiz_progress
  where user_id = uid;

  select exists(
    select 1 from public.quiz_daily_scores
    where user_id = uid and play_date = today
  ) into already;

  if already then
    select points into old_daily
    from public.quiz_daily_scores
    where user_id = uid and play_date = today;

    -- Replace today's contribution: remove old daily points, add new.
    new_total := greatest(0, prev_points - coalesce(old_daily, 0) + greatest(0, p_points));
  else
    new_total := greatest(0, prev_points + greatest(0, p_points));
  end if;

  new_level := public.quiz_level_from_points(new_total);
  leveled_up := new_level > prev_level;
  leveled_down := new_level < prev_level;

  insert into public.quiz_daily_scores as d (
    user_id, play_date, points, correct_count, total_count, level_id, finished_at
  ) values (
    uid, today, greatest(0, p_points), p_correct, p_total, new_level, now()
  )
  on conflict (user_id, play_date) do update set
    points = excluded.points,
    correct_count = excluded.correct_count,
    total_count = excluded.total_count,
    level_id = excluded.level_id,
    finished_at = excluded.finished_at;

  update public.quiz_progress set
    total_points = new_total,
    level_id = new_level,
    last_daily_points = greatest(0, p_points),
    last_daily_score = p_correct,
    last_daily_total = p_total,
    last_played_date = today,
    absence_applied_through = today,
    updated_at = now()
  where user_id = uid;

  return jsonb_build_object(
    'total_points', new_total,
    'level_id', new_level,
    'leveled_up', leveled_up,
    'leveled_down', leveled_down,
    'today_points', greatest(0, p_points),
    'correct', p_correct,
    'total', p_total
  );
end;
$$;

revoke all on function public.submit_daily_quiz_result(integer, integer, integer, date) from public;
grant execute on function public.submit_daily_quiz_result(integer, integer, integer, date) to authenticated;

-- ── tick_quiz_absence ──────────────────────────────────────────────────────
-- Charge −100 per missed calendar day since last play (through yesterday).

create or replace function public.tick_quiz_absence()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  yesterday date := today - 1;
  last_play date;
  applied_through date;
  cursor_day date;
  missed integer := 0;
  prev_points integer;
  prev_level integer;
  new_total integer;
  new_level integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select last_played_date, absence_applied_through, total_points, level_id
    into last_play, applied_through, prev_points, prev_level
  from public.quiz_progress
  where user_id = uid;

  if not found or last_play is null then
    return jsonb_build_object('applied', false, 'missed_days', 0);
  end if;

  -- First day to charge = day after last play.
  cursor_day := last_play + 1;
  if applied_through is not null and applied_through + 1 > cursor_day then
    cursor_day := applied_through + 1;
  end if;

  while cursor_day <= yesterday loop
    missed := missed + 1;
    cursor_day := cursor_day + 1;
  end loop;

  if missed = 0 then
    return jsonb_build_object(
      'applied', false,
      'missed_days', 0,
      'total_points', prev_points,
      'level_id', prev_level
    );
  end if;

  new_total := greatest(0, prev_points - (missed * 100));
  new_level := public.quiz_level_from_points(new_total);

  update public.quiz_progress set
    total_points = new_total,
    level_id = new_level,
    absence_applied_through = yesterday,
    updated_at = now()
  where user_id = uid;

  return jsonb_build_object(
    'applied', true,
    'missed_days', missed,
    'penalty', missed * 100,
    'total_points', new_total,
    'level_id', new_level,
    'leveled_down', new_level < prev_level
  );
end;
$$;

revoke all on function public.tick_quiz_absence() from public;
grant execute on function public.tick_quiz_absence() to authenticated;

-- ── quiz_level_board ───────────────────────────────────────────────────────
-- Top 50 in caller's level today + neighbor window around caller.
-- Exposes display name / avatar via security definer (profiles are owner-only).

create or replace function public.quiz_level_board(p_play_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := coalesce(p_play_date, (timezone('utc', now()))::date);
  my_level integer;
  my_rank integer;
  my_points integer;
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select level_id, points into my_level, my_points
  from public.quiz_daily_scores
  where user_id = uid and play_date = today;

  if my_level is null then
    select level_id into my_level from public.quiz_progress where user_id = uid;
    my_level := coalesce(my_level, 0);
    return jsonb_build_object(
      'level_id', my_level,
      'rank', null,
      'rows', '[]'::jsonb,
      'played_today', false
    );
  end if;

  -- Rank among same level today (points desc, earlier finish wins ties).
  select r.rank into my_rank
  from (
    select
      user_id,
      rank() over (
        order by points desc, finished_at asc, user_id asc
      ) as rank
    from public.quiz_daily_scores
    where play_date = today and level_id = my_level
  ) r
  where r.user_id = uid;

  with ranked as (
    select
      d.user_id,
      d.points,
      d.level_id,
      rank() over (
        order by d.points desc, d.finished_at asc, d.user_id asc
      ) as rank,
      coalesce(
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email, ''), '@', 1),
        'Member'
      ) as display_name,
      p.avatar_url
    from public.quiz_daily_scores d
    left join public.profiles p on p.id = d.user_id
    where d.play_date = today and d.level_id = my_level
  ),
  picked as (
    select *
    from ranked
    where
      rank <= 50
      or rank between greatest(1, my_rank - 1) and my_rank + 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'rank', rank,
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'points', points,
      'is_you', user_id = uid
    )
    order by rank asc
  )
  into result
  from (
    select distinct on (rank) *
    from picked
    order by rank, user_id
  ) x;

  return jsonb_build_object(
    'level_id', my_level,
    'rank', my_rank,
    'points', my_points,
    'played_today', true,
    'rows', coalesce(result, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.quiz_level_board(date) from public;
grant execute on function public.quiz_level_board(date) to authenticated;
