-- ===========================================================================
-- Narsil — Integrity guards for member uploads and quiz scores
-- ---------------------------------------------------------------------------
-- Closes the client-trust gaps found in the 2026-10-24 review
-- (REVIEW-TODO.md, P0):
--
--   1. ARTWORKS — members could rewrite any column of their own rows, even
--      after approval: swap the image past moderation, point source_image_url
--      at an internal address the backend would fetch (SSRF), set like counts,
--      or attach the work to someone else's artist profile. Member inserts are
--      now pinned to their own Storage upload, and every content column is
--      locked once the row exists.
--   2. ARTWORKS SELECT — pending / rejected / taken-down rows were readable by
--      anyone with the anon key. Hidden rows are now visible only to their
--      uploader and admins.
--   3. QUIZ — leaderboards trusted whatever the client sent. Daily points are
--      now capped by what the scoring rules can award, the play date must be
--      within a day of UTC today, the score tables are no longer writable
--      directly, and topic-trial scores are bounded.
--
-- Only DIRECT client writes are restricted. The guards check `current_user`:
-- requests from the app run as `authenticated`, while the service role (the
-- backend, ingest) and SECURITY DEFINER helpers (like/save counters,
-- submit_daily_quiz_result, tick_quiz_absence) run as other roles and pass
-- through untouched. Admins pass through too.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste this file → Run.
--   Requires: schema.sql → catalog-columns.sql → migrations-roadmap.sql →
--             admin-dashboard.sql → artwork-source-image.sql →
--             licensed-museums.sql → artwork-approval.sql → quiz-progress.sql →
--             quiz-levels.sql → quiz-scores.sql
--   Safe to re-run.
--
-- BEFORE RUNNING on a different Supabase project: edit
-- `artwork_upload_url_prefix()` below to that project's URL.
-- ===========================================================================


-- ── 1. Artworks: member write guard ────────────────────────────────────────

-- Public URL prefix of the `artworks` Storage bucket. Member uploads must live
-- under `<prefix><their user id>/`. Pinned to this project's host on purpose:
-- a pattern like `%.supabase.co` would also accept a look-alike project the
-- uploader controls, where the image could be swapped after approval.
create or replace function public.artwork_upload_url_prefix()
returns text
language sql
immutable
as $$
  select 'https://oocqhiojgtjrkvdsthzz.supabase.co/storage/v1/object/public/artworks/'::text;
$$;

-- SECURITY INVOKER on purpose: `current_user` must be the caller's role, not
-- this function's owner, to tell app requests apart from trusted writers.
create or replace function public.artworks_guard_member_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Columns a member may still change on a row they uploaded.
  editable constant text[] := array['for_sale', 'search_doc', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.image_url is not null
       and (
         left(new.image_url, length(public.artwork_upload_url_prefix() || auth.uid()::text || '/'))
           <> public.artwork_upload_url_prefix() || auth.uid()::text || '/'
         or new.image_url like '%..%'
       ) then
      raise exception 'Artwork images must be uploaded through the app.'
        using errcode = '42501';
    end if;

    if new.artist_id is not null and not exists (
      select 1 from public.artists
      where id = new.artist_id and user_id = auth.uid()
    ) then
      raise exception 'You can only post work to your own artist profile.'
        using errcode = '42501';
    end if;

    -- Fields only ingest / admins set. A member upload is never a museum
    -- master, never pre-liked, never featured.
    new.source_image_url := null;
    new.museum_source_id := null;
    new.ai_description := null;
    new.like_count := 0;
    new.save_count := 0;
    new.featured := false;
    if coalesce(new.origin, 'artist-original') <> 'artist-original' then
      new.for_sale := false;
    end if;
    return new;
  end if;

  -- UPDATE: everything but the editable columns is frozen. Comparing whole
  -- rows also covers columns added later.
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'Posted artworks can''t be edited. Delete it and post again, or contact support.'
      using errcode = '42501';
  end if;
  if new.for_sale and coalesce(new.origin, 'artist-original') <> 'artist-original' then
    new.for_sale := false;
  end if;
  return new;
end;
$$;

drop trigger if exists artworks_guard_member_writes on public.artworks;
create trigger artworks_guard_member_writes
  before insert or update on public.artworks
  for each row execute function public.artworks_guard_member_writes();


-- ── 2. Artworks: hide unapproved rows from everyone but owner + admins ─────

drop policy if exists "Artworks are public" on public.artworks;
create policy "Artworks are public"
  on public.artworks for select
  using (
    not coalesce(hidden, false)
    or created_by = (select auth.uid())
    or (select public.is_admin())
  );


-- ── 3a. Daily scores: written only by submit_daily_quiz_result ─────────────

drop policy if exists "Users manage their own daily quiz scores" on public.quiz_daily_scores;
drop policy if exists "Users read their own daily quiz scores" on public.quiz_daily_scores;
create policy "Users read their own daily quiz scores"
  on public.quiz_daily_scores for select
  to authenticated
  using (auth.uid() = user_id);

-- Same body as quiz-levels.sql, plus input validation. Limits mirror
-- museum-app/src/lib/quiz/levels.ts: at most PER_ANSWER_CAP (120) per correct
-- answer plus PERFECT_DAILY_BONUS (50). A daily is DAILY_COUNT (10) questions;
-- 20 leaves room for longer admin editions.
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
  utc_today date := (timezone('utc', now()))::date;
  today date := coalesce(p_play_date, utc_today);
  prev_points integer := 0;
  prev_level integer := 0;
  new_total integer;
  new_level integer;
  leveled_up boolean := false;
  leveled_down boolean := false;
  already boolean := false;
  old_daily integer := 0;
  pts integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- The app sends its LOCAL calendar day; time zones span UTC−12…+14.
  if today not between utc_today - 1 and utc_today + 1 then
    raise exception 'play date % is not today', today using errcode = '22023';
  end if;
  if p_total is null or p_total < 1 or p_total > 20
     or p_correct is null or p_correct < 0 or p_correct > p_total then
    raise exception 'invalid daily result' using errcode = '22023';
  end if;
  pts := least(greatest(0, coalesce(p_points, 0)), p_correct * 120 + 50);

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
    new_total := greatest(0, prev_points - coalesce(old_daily, 0) + pts);
  else
    new_total := greatest(0, prev_points + pts);
  end if;

  new_level := public.quiz_level_from_points(new_total);
  leveled_up := new_level > prev_level;
  leveled_down := new_level < prev_level;

  insert into public.quiz_daily_scores as d (
    user_id, play_date, points, correct_count, total_count, level_id, finished_at
  ) values (
    uid, today, pts, p_correct, p_total, new_level, now()
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
    last_daily_points = pts,
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
    'today_points', pts,
    'correct', p_correct,
    'total', p_total
  );
end;
$$;

revoke all on function public.submit_daily_quiz_result(integer, integer, integer, date) from public;
grant execute on function public.submit_daily_quiz_result(integer, integer, integer, date) to authenticated;


-- ── 3b. Quiz progress: points and level only move through the RPCs ────────
-- The app still upserts streak / answered counts directly (quizRemote.ts),
-- so the row stays writable; the competition columns are pinned instead of
-- rejected, so those other fields still save.

create or replace function public.quiz_progress_guard_points()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.total_points := 0;
    new.level_id := 0;
    new.last_daily_points := null;
    new.absence_applied_through := null;
  else
    new.total_points := old.total_points;
    new.level_id := old.level_id;
    new.last_daily_points := old.last_daily_points;
    new.absence_applied_through := old.absence_applied_through;
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_progress_guard_points on public.quiz_progress;
create trigger quiz_progress_guard_points
  before insert or update on public.quiz_progress
  for each row execute function public.quiz_progress_guard_points();

-- "Reset quiz data" (lib/quiz/progress.ts → resetQuizData). An explicit RPC
-- rather than letting the guard accept zeros: a stale device whose local
-- absence penalties reached 0 also upserts zeros, and must not wipe the
-- server total. Daily rows stay — they are the monthly Hall's history.
create or replace function public.reset_quiz_progress()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.quiz_progress set
    streak = 0,
    last_played_date = null,
    last_daily_score = null,
    last_daily_total = null,
    total_answered = 0,
    total_points = 0,
    level_id = 0,
    last_daily_points = null,
    absence_applied_through = null,
    updated_at = now()
  where user_id = auth.uid();
end;
$$;

revoke all on function public.reset_quiz_progress() from public;
grant execute on function public.reset_quiz_progress() to authenticated;


-- ── 3c. Topic-trial scores (Discover Hall): bounded rows ──────────────────
-- A trial is at most 10 questions (Master). Ids look like
-- `age:<id>:<difficulty>` / `empire:<name>:<difficulty>` (lib/quiz/topic.ts).

create or replace function public.quiz_scores_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if new.quiz_id !~ '^(age|empire):[^:]{1,60}:(apprentice|scholar|master)$' then
    raise exception 'unknown quiz %', new.quiz_id using errcode = '22023';
  end if;
  if new.total < 1 or new.total > 10 or new.score < 0 or new.score > new.total then
    raise exception 'invalid quiz score' using errcode = '22023';
  end if;
  new.stars := least(new.stars, round(new.score::numeric / new.total * 5)::smallint);
  if tg_op = 'INSERT' and (
    select count(*) from public.quiz_scores where user_id = new.user_id
  ) >= 300 then
    raise exception 'too many quiz scores' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists quiz_scores_guard on public.quiz_scores;
create trigger quiz_scores_guard
  before insert or update on public.quiz_scores
  for each row execute function public.quiz_scores_guard();


-- ── 3d. Clamp rows written before these guards ─────────────────────────────
-- Keeps the Hall sums (`sum(...)::integer` in quiz-halls.sql) from
-- overflowing on values planted earlier. Runs as the SQL editor role, so the
-- guards above don't fire.

update public.quiz_daily_scores
set total_count = least(total_count, 20),
    correct_count = least(correct_count, least(total_count, 20)),
    points = least(points, least(correct_count, least(total_count, 20)) * 120 + 50)
where total_count > 20
   or correct_count > total_count
   or points > least(correct_count, least(total_count, 20)) * 120 + 50;

-- A real total is the sum of daily points minus absence penalties, so it can
-- never exceed that sum. Anything above it was written by the client.
with earned as (
  select user_id, sum(points)::bigint as pts
  from public.quiz_daily_scores
  group by user_id
)
update public.quiz_progress qp
set total_points = least(qp.total_points, coalesce(e.pts, 0))::integer,
    level_id = public.quiz_level_from_points(least(qp.total_points, coalesce(e.pts, 0))::integer)
from (select user_id from public.quiz_progress) u
left join earned e on e.user_id = u.user_id
where qp.user_id = u.user_id
  and qp.total_points > coalesce(e.pts, 0);

update public.quiz_scores
set total = least(total, 10),
    score = least(score, least(total, 10))
where total > 10 or score > total;
