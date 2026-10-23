-- ===========================================================================
-- Narsil — Royal Assessment halls beyond today's board
-- ---------------------------------------------------------------------------
-- quiz_month_board    Monthly Hall: this month's daily points summed, across
--                     every member at every level.
-- quiz_discover_board Discover Hall: best Discover trial scores (correct
--                     answers) summed per difficulty, across every member.
--
-- Both return the same shape as quiz_level_board (top 50 + neighbors around
-- the caller) so the app renders them with one component.
--
-- REQUIRES: quiz-levels.sql (11), quiz-scores.sql (27)
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ===========================================================================

create index if not exists quiz_daily_scores_day_user
  on public.quiz_daily_scores (play_date, user_id);

-- ── quiz_month_board ──────────────────────────────────────────────────────

drop function if exists public.quiz_month_board(date);

create or replace function public.quiz_month_board(p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  month_start date := date_trunc(
    'month', coalesce(p_month, (timezone('utc', now()))::date)
  )::date;
  month_end date := (month_start + interval '1 month')::date;
  my_level integer;
  my_rank integer;
  my_points integer;
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select level_id into my_level from public.quiz_progress where user_id = uid;
  my_level := coalesce(my_level, 0);

  with totals as (
    select d.user_id, sum(d.points)::integer as points, max(d.finished_at) as last_at
    from public.quiz_daily_scores d
    where d.play_date >= month_start and d.play_date < month_end
    group by d.user_id
  ),
  ranked as (
    select
      t.user_id,
      t.points,
      rank() over (order by t.points desc, t.last_at asc, t.user_id asc) as rank
    from totals t
  )
  select rank, points into my_rank, my_points from ranked where user_id = uid;

  with totals as (
    select d.user_id, sum(d.points)::integer as points, max(d.finished_at) as last_at
    from public.quiz_daily_scores d
    where d.play_date >= month_start and d.play_date < month_end
    group by d.user_id
  ),
  ranked as (
    select
      t.user_id,
      t.points,
      rank() over (order by t.points desc, t.last_at asc, t.user_id asc) as rank,
      coalesce(qp.level_id, 0) as level_id,
      coalesce(
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email, ''), '@', 1),
        'Member'
      ) as display_name,
      p.avatar_url
    from totals t
    left join public.profiles p on p.id = t.user_id
    left join public.quiz_progress qp on qp.user_id = t.user_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'rank', rank,
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'points', points,
      'level_id', level_id,
      'is_you', user_id = uid
    )
    order by rank asc
  )
  into result
  from ranked
  where rank <= 50
    or (my_rank is not null and rank between greatest(1, my_rank - 1) and my_rank + 1);

  return jsonb_build_object(
    'level_id', my_level,
    'rank', my_rank,
    'points', my_points,
    'played', my_rank is not null,
    'rows', coalesce(result, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.quiz_month_board(date) from public;
grant execute on function public.quiz_month_board(date) to authenticated;

-- ── quiz_discover_board ───────────────────────────────────────────────────
-- quiz_scores.quiz_id is "<kind>:<topic>:<difficulty>" (see badgeId in
-- src/lib/quiz/topic.ts); score is the correct-answer count of the best run.

drop function if exists public.quiz_discover_board(text);

create or replace function public.quiz_discover_board(p_difficulty text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  my_level integer;
  my_rank integer;
  my_points integer;
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_difficulty not in ('apprentice', 'scholar', 'master') then
    raise exception 'unknown difficulty %', p_difficulty;
  end if;

  select level_id into my_level from public.quiz_progress where user_id = uid;
  my_level := coalesce(my_level, 0);

  with totals as (
    select s.user_id, sum(s.score)::integer as points, max(s.updated_at) as last_at
    from public.quiz_scores s
    where s.quiz_id like '%:' || p_difficulty and s.score > 0
    group by s.user_id
  ),
  ranked as (
    select
      t.user_id,
      t.points,
      rank() over (order by t.points desc, t.last_at asc, t.user_id asc) as rank
    from totals t
  )
  select rank, points into my_rank, my_points from ranked where user_id = uid;

  with totals as (
    select s.user_id, sum(s.score)::integer as points, max(s.updated_at) as last_at
    from public.quiz_scores s
    where s.quiz_id like '%:' || p_difficulty and s.score > 0
    group by s.user_id
  ),
  ranked as (
    select
      t.user_id,
      t.points,
      rank() over (order by t.points desc, t.last_at asc, t.user_id asc) as rank,
      coalesce(qp.level_id, 0) as level_id,
      coalesce(
        nullif(trim(p.full_name), ''),
        split_part(coalesce(p.email, ''), '@', 1),
        'Member'
      ) as display_name,
      p.avatar_url
    from totals t
    left join public.profiles p on p.id = t.user_id
    left join public.quiz_progress qp on qp.user_id = t.user_id
  )
  select jsonb_agg(
    jsonb_build_object(
      'rank', rank,
      'user_id', user_id,
      'display_name', display_name,
      'avatar_url', avatar_url,
      'points', points,
      'level_id', level_id,
      'is_you', user_id = uid
    )
    order by rank asc
  )
  into result
  from ranked
  where rank <= 50
    or (my_rank is not null and rank between greatest(1, my_rank - 1) and my_rank + 1);

  return jsonb_build_object(
    'level_id', my_level,
    'rank', my_rank,
    'points', my_points,
    'played', my_rank is not null,
    'rows', coalesce(result, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.quiz_discover_board(text) from public;
grant execute on function public.quiz_discover_board(text) to authenticated;
