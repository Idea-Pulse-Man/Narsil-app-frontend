-- ===========================================================================
-- Narsil — quiz question engine (question styles, generated pool, daily mix)
-- ---------------------------------------------------------------------------
-- quiz_styles           One row per question style. The admin "Question
--                       Styles" panel edits these: on/off, per_run, surfaces,
--                       settings. The backend cron reads them.
-- quiz_items            The generated question pool, in one generic format
--                       (answer_type + media / options / answer as jsonb).
-- daily_quiz_items      The daily edition for app versions with the engine.
--                       (Old versions keep reading daily_quiz_questions.)
-- quiz_generation_runs  Run history + a lock so two runs never overlap.
-- quiz_engine_config    Single row: daily question count, practice mix.
--
-- The generator lives in narsil-museum-backend/src/quiz/ (cron:
-- `npm run quiz:generate:prod`, see INGEST.md). Styles are seeded here
-- switched OFF except `classic`; turn them on from the admin panel.
--
-- REQUIRES: admin-dashboard.sql (8) for is_admin() / require_admin().
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run. Safe to re-run (never drops data,
--   never overwrites the admin's switches or settings).
-- ===========================================================================

-- ── Config (single row) ───────────────────────────────────────────────────

create table if not exists public.quiz_engine_config (
  id            smallint primary key default 1 check (id = 1),
  -- Questions in each day's edition.
  daily_count   smallint not null default 10 check (daily_count between 1 and 30),
  -- Percent of practice questions taken from the generated pool (the rest are
  -- built on device from the catalog, as before).
  practice_mix  smallint not null default 60 check (practice_mix between 0 and 100),
  updated_at    timestamptz not null default now()
);

insert into public.quiz_engine_config (id) values (1) on conflict (id) do nothing;

-- ── Styles ────────────────────────────────────────────────────────────────

create table if not exists public.quiz_styles (
  id               text primary key,
  label            text not null,
  answer_type      text not null,
  enabled          boolean not null default false,
  per_run          smallint not null default 8 check (per_run between 0 and 200),
  surfaces         text[] not null default '{practice}',
  -- Overrides only; the backend merges them over the style's defaults.
  settings         jsonb not null default '{}'::jsonb,
  -- When true, new questions wait in status 'review' for an admin to approve.
  require_review   boolean not null default false,
  -- Informational: the first app version that can show this style.
  min_app_version  text,
  sort_order       smallint not null default 100,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id) on delete set null
);

-- Focus mode: when set, EVERY daily and practice question is this one style
-- (even if it's switched off). Null = the normal mix of enabled styles.
alter table public.quiz_engine_config
  add column if not exists focus_style text references public.quiz_styles(id) on delete set null;

-- ── Runs ──────────────────────────────────────────────────────────────────

create table if not exists public.quiz_generation_runs (
  id            uuid primary key default gen_random_uuid(),
  trigger       text not null check (trigger in ('cron', 'admin')),
  status        text not null default 'running' check (status in ('running', 'done', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  created       jsonb not null default '{}'::jsonb,
  rejected      jsonb not null default '{}'::jsonb,
  problems      jsonb not null default '[]'::jsonb,
  daily_added   integer not null default 0,
  requested_by  uuid references auth.users(id) on delete set null
);

create index if not exists quiz_generation_runs_started_idx
  on public.quiz_generation_runs (started_at desc);

-- ── Question pool ─────────────────────────────────────────────────────────

create table if not exists public.quiz_items (
  id             uuid primary key default gen_random_uuid(),
  style          text not null references public.quiz_styles(id) on update cascade,
  answer_type    text not null check (
    answer_type in ('single', 'multi', 'binary', 'order', 'match', 'numeric', 'text')
  ),
  prompt         text not null check (char_length(trim(prompt)) between 1 and 500),
  media          jsonb not null default '{}'::jsonb,
  options        jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  -- Kept in its own column so battles can later serve items without it.
  answer         jsonb not null,
  explain        text,
  difficulty     text not null default 'scholar' check (difficulty in ('apprentice', 'scholar', 'master')),
  artwork_ids    text[] not null default '{}',
  fingerprint    text not null unique,
  status         text not null default 'live' check (status in ('live', 'review', 'retired')),
  source         text not null default 'generated' check (source in ('generated', 'admin', 'ai')),
  run_id         uuid references public.quiz_generation_runs(id) on delete set null,
  shown_count    integer not null default 0,
  correct_count  integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists quiz_items_live_style_idx
  on public.quiz_items (status, style, created_at desc);

-- ── Daily edition ─────────────────────────────────────────────────────────

create table if not exists public.daily_quiz_items (
  quiz_date   date not null,
  position    smallint not null check (position between 1 and 30),
  item_id     uuid not null references public.quiz_items(id) on delete cascade,
  source      text not null default 'generated' check (source in ('generated', 'admin')),
  created_at  timestamptz not null default now(),
  primary key (quiz_date, position),
  unique (quiz_date, item_id)
);

create index if not exists daily_quiz_items_item_idx
  on public.daily_quiz_items (item_id, quiz_date);

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.quiz_engine_config   enable row level security;
alter table public.quiz_styles          enable row level security;
alter table public.quiz_generation_runs enable row level security;
alter table public.quiz_items           enable row level security;
alter table public.daily_quiz_items     enable row level security;

drop policy if exists "Anyone reads quiz engine config" on public.quiz_engine_config;
create policy "Anyone reads quiz engine config"
  on public.quiz_engine_config for select to anon, authenticated using (true);

drop policy if exists "Admins update quiz engine config" on public.quiz_engine_config;
create policy "Admins update quiz engine config"
  on public.quiz_engine_config for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Anyone reads quiz styles" on public.quiz_styles;
create policy "Anyone reads quiz styles"
  on public.quiz_styles for select to anon, authenticated using (true);

drop policy if exists "Admins update quiz styles" on public.quiz_styles;
create policy "Admins update quiz styles"
  on public.quiz_styles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read generation runs" on public.quiz_generation_runs;
create policy "Admins read generation runs"
  on public.quiz_generation_runs for select to authenticated using (public.is_admin());

drop policy if exists "Anyone reads live quiz items" on public.quiz_items;
create policy "Anyone reads live quiz items"
  on public.quiz_items for select to anon, authenticated
  using (status = 'live' or public.is_admin());

drop policy if exists "Admins update quiz items" on public.quiz_items;
create policy "Admins update quiz items"
  on public.quiz_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins delete quiz items" on public.quiz_items;
create policy "Admins delete quiz items"
  on public.quiz_items for delete to authenticated using (public.is_admin());

drop policy if exists "Anyone reads daily quiz items" on public.daily_quiz_items;
create policy "Anyone reads daily quiz items"
  on public.daily_quiz_items for select to anon, authenticated using (true);

drop policy if exists "Admins write daily quiz items" on public.daily_quiz_items;
create policy "Admins write daily quiz items"
  on public.daily_quiz_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Inserts into quiz_items / quiz_generation_runs come from the backend's
-- service-role key, which bypasses RLS — no insert policy for app users.

-- ── App RPCs ──────────────────────────────────────────────────────────────

-- A random batch for practice. The app passes the answer types it can draw,
-- so switching on a style an old app can't render never reaches that app.
-- In focus mode only the focused style is served (on or off).
-- Styles get an EQUAL share: one random question from each style, then a
-- second from each, … — a style with 80 questions doesn't crowd out one with 8.
create or replace function public.next_quiz_items(
  p_surface       text   default 'practice',
  p_answer_types  text[] default null,
  p_exclude       uuid[] default '{}',
  p_limit         int    default 20
)
returns setof public.quiz_items
language sql
stable
set search_path = public
as $$
  select i.*
  from public.quiz_items i
  join (
    select q.id,
           row_number() over (partition by q.style order by random()) as style_rank
    from public.quiz_items q
    join public.quiz_styles s on s.id = q.style
    left join public.quiz_engine_config c on c.id = 1
    where q.status = 'live'
      and (p_answer_types is null or q.answer_type = any (p_answer_types))
      and not (q.id = any (coalesce(p_exclude, '{}')))
      and case
            when c.focus_style is not null then q.style = c.focus_style
            else s.enabled and p_surface = any (s.surfaces)
          end
  ) picked on picked.id = i.id
  order by picked.style_rank, random()
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- One UTC day's edition, in play order, limited to the caller's answer types.
-- In focus mode it is `daily_count` questions of the focused style instead,
-- picked in a fixed order per day (so everyone gets the same set that day).
create or replace function public.daily_quiz_edition(
  p_date          date   default null,
  p_answer_types  text[] default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  day     date := coalesce(p_date, (now() at time zone 'utc')::date);
  focus   text;
  wanted  int;
  result  jsonb;
begin
  select c.focus_style, c.daily_count into focus, wanted
  from public.quiz_engine_config c
  where c.id = 1;

  if focus is not null then
    select coalesce(
      jsonb_agg(to_jsonb(i) || jsonb_build_object('position', r.rn) order by r.rn),
      '[]'::jsonb
    ) into result
    from (
      select q.id,
             row_number() over (order by md5(q.id::text || day::text)) as rn
      from public.quiz_items q
      where q.status = 'live'
        and q.style = focus
        and (p_answer_types is null or q.answer_type = any (p_answer_types))
    ) r
    join public.quiz_items i on i.id = r.id
    where r.rn <= coalesce(wanted, 10);
    return result;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(i) || jsonb_build_object('position', d.position) order by d.position),
    '[]'::jsonb
  ) into result
  from public.daily_quiz_items d
  join public.quiz_items i on i.id = d.item_id
  where d.quiz_date = day
    and i.status = 'live'
    and (p_answer_types is null or i.answer_type = any (p_answer_types));
  return result;
end;
$$;

-- Play stats: how often a question is shown / answered right. Feeds the
-- admin's "too easy / too hard" flags.
create or replace function public.record_quiz_item_result(p_item uuid, p_correct boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.quiz_items
     set shown_count   = shown_count + 1,
         correct_count = correct_count + case when p_correct then 1 else 0 end
   where id = p_item and status = 'live';
$$;

-- ── Admin RPCs ────────────────────────────────────────────────────────────

-- Per style: how many items in each status, plus play stats.
create or replace function public.admin_quiz_style_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select coalesce(jsonb_object_agg(style, stats), '{}'::jsonb) into result
  from (
    select style,
           jsonb_build_object(
             'live',    count(*) filter (where status = 'live'),
             'review',  count(*) filter (where status = 'review'),
             'retired', count(*) filter (where status = 'retired'),
             'shown',   coalesce(sum(shown_count), 0),
             'correct', coalesce(sum(correct_count), 0)
           ) as stats
    from public.quiz_items
    group by style
  ) t;
  return result;
end;
$$;

grant execute on function public.next_quiz_items(text, text[], uuid[], int) to anon, authenticated;
grant execute on function public.daily_quiz_edition(date, text[]) to anon, authenticated;
grant execute on function public.record_quiz_item_result(uuid, boolean) to anon, authenticated;
grant execute on function public.admin_quiz_style_stats() to authenticated;

-- ── Seed styles (names / answer types refresh; admin choices are kept) ─────

insert into public.quiz_styles (id, label, answer_type, enabled, per_run, surfaces, sort_order, min_app_version)
values
  ('classic',       'Classic',              'single',  true,  10, '{daily,practice}', 10,  null),
  ('pick_image',    'Pick one',             'single',  false, 8,  '{daily,practice}', 20,  '1.1.0'),
  ('select_all',    'Select all',           'multi',   false, 8,  '{daily,practice}', 30,  '1.1.0'),
  ('odd_one_out',   'Odd one out',          'single',  false, 8,  '{daily,practice}', 40,  '1.1.0'),
  ('find_pair',     'Find the pair',        'multi',   false, 6,  '{practice}',       50,  '1.1.0'),
  ('placard_match', 'Placard match',        'single',  false, 6,  '{practice}',       60,  '1.1.0'),
  ('detail_match',  'Detail match',         'single',  false, 8,  '{daily,practice}', 70,  '1.1.0'),
  ('zoom_reveal',   'Zoom-out',             'single',  false, 8,  '{practice}',       80,  '1.1.0'),
  ('blur_reveal',   'Blur reveal',          'single',  false, 6,  '{practice}',       90,  '1.1.0'),
  ('tiles_reveal',  'Tile reveal',          'single',  false, 6,  '{practice}',       100, '1.1.0'),
  ('mirror',        'Real or mirrored',     'binary',  false, 6,  '{practice}',       110, '1.1.0'),
  ('intruder_tile', 'Intruder tile',        'single',  false, 6,  '{practice}',       120, '1.1.0'),
  ('missing_piece', 'Missing piece',        'single',  false, 6,  '{practice}',       130, '1.1.0'),
  ('timeline',      'Timeline',             'order',   false, 8,  '{daily,practice}', 140, '1.1.0'),
  ('match_pairs',   'Match pairs',          'match',   false, 6,  '{practice}',       150, '1.1.0'),
  ('match_period',  'Match to period',      'match',   false, 6,  '{practice}',       160, '1.1.0'),
  ('sort_groups',   'Sort into groups',     'match',   false, 6,  '{practice}',       170, '1.1.0'),
  ('year_slider',   'Year slider',          'numeric', false, 8,  '{daily,practice}', 180, '1.1.0'),
  ('before_after',  'Before or after',      'binary',  false, 8,  '{daily,practice}', 190, '1.1.0'),
  ('older_newer',   'Older or newer',       'binary',  false, 8,  '{daily,practice}', 200, '1.1.0'),
  ('more_loved',    'More loved',           'binary',  false, 6,  '{practice}',       210, '1.1.0'),
  ('true_false',    'True or false',        'binary',  false, 8,  '{daily,practice}', 220, '1.1.0'),
  ('two_truths',    'Two truths and a lie', 'single',  false, 6,  '{practice}',       230, '1.1.0'),
  ('fill_title',    'Fill the title',       'single',  false, 6,  '{daily,practice}', 240, '1.1.0'),
  ('type_artist',   'Type the artist',      'text',    false, 6,  '{practice}',       250, '1.1.0'),
  ('unscramble',    'Unscramble',           'text',    false, 6,  '{practice}',       260, '1.1.0'),
  ('clue_ladder',   'Clue ladder',          'single',  false, 6,  '{practice}',       270, '1.1.0')
on conflict (id) do update
  set label = excluded.label,
      answer_type = excluded.answer_type,
      sort_order = excluded.sort_order,
      min_app_version = excluded.min_app_version;
