-- ===========================================================================
-- Narsil — shared daily Royal Assessment
-- ---------------------------------------------------------------------------
-- One edition per calendar day (UTC). The backend cron fills an unlocked day
-- up to 10 questions and never deletes admin rows. Admins pin special
-- problems and can lock a day so the cron leaves it alone.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run.
-- ===========================================================================

create table if not exists public.daily_quizzes (
  quiz_date   date primary key,
  locked      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.daily_quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  quiz_date      date not null references public.daily_quizzes (quiz_date) on delete cascade,
  position       smallint not null check (position between 1 and 12),
  source         text not null check (source in ('generated', 'admin')),
  mode           text not null,
  artwork_id     text,
  image_url      text,
  accent         text,
  title          text,
  artist_name    text,
  year           text,
  prompt         text not null check (char_length(trim(prompt)) between 1 and 500),
  options        jsonb not null,
  correct_index  smallint not null check (correct_index between 0 and 3),
  created_at     timestamptz not null default now(),
  constraint daily_quiz_questions_position unique (quiz_date, position),
  constraint daily_quiz_questions_options check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4
  )
);

create index if not exists daily_quiz_questions_date_idx
  on public.daily_quiz_questions (quiz_date, position);

alter table public.daily_quizzes enable row level security;
alter table public.daily_quiz_questions enable row level security;

drop policy if exists "Anyone can read daily quizzes" on public.daily_quizzes;
create policy "Anyone can read daily quizzes"
  on public.daily_quizzes for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read daily quiz questions" on public.daily_quiz_questions;
create policy "Anyone can read daily quiz questions"
  on public.daily_quiz_questions for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins write daily quizzes" on public.daily_quizzes;
create policy "Admins write daily quizzes"
  on public.daily_quizzes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins write daily quiz questions" on public.daily_quiz_questions;
create policy "Admins write daily quiz questions"
  on public.daily_quiz_questions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin: list one day's edition (header + questions).
create or replace function public.admin_list_daily_quiz(p_date date)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  result json;
begin
  perform public.require_admin();

  select json_build_object(
    'quiz_date', p_date,
    'locked', coalesce((select q.locked from public.daily_quizzes q where q.quiz_date = p_date), false),
    'questions', coalesce((
      select json_agg(row_to_json(t) order by t.position)
      from (
        select
          id, quiz_date, position, source, mode, artwork_id, image_url, accent,
          title, artist_name, year, prompt, options, correct_index, created_at
        from public.daily_quiz_questions
        where quiz_date = p_date
        order by position
      ) t
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_daily_quiz(date) to authenticated;

-- Admin: pin a special problem. Cron will not delete it. Position is the next free slot.
create or replace function public.admin_add_daily_special(
  p_date          date,
  p_mode          text,
  p_prompt        text,
  p_options       jsonb,
  p_correct_index int,
  p_artwork_id    text default null,
  p_image_url     text default null,
  p_accent        text default null,
  p_title         text default null,
  p_artist_name   text default null,
  p_year          text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  next_pos int;
  row public.daily_quiz_questions;
begin
  perform public.require_admin();

  if p_options is null or jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then
    raise exception 'options must be a JSON array of 4 strings';
  end if;
  if p_correct_index < 0 or p_correct_index > 3 then
    raise exception 'correct_index must be 0..3';
  end if;
  if char_length(trim(p_prompt)) < 1 then
    raise exception 'prompt is required';
  end if;

  insert into public.daily_quizzes (quiz_date)
  values (p_date)
  on conflict (quiz_date) do nothing;

  select coalesce(max(position), 0) + 1 into next_pos
  from public.daily_quiz_questions
  where quiz_date = p_date;

  if next_pos > 12 then
    raise exception 'this day already has 12 problems';
  end if;

  insert into public.daily_quiz_questions (
    quiz_date, position, source, mode, artwork_id, image_url, accent,
    title, artist_name, year, prompt, options, correct_index
  ) values (
    p_date, next_pos, 'admin', p_mode, nullif(trim(p_artwork_id), ''),
    nullif(trim(p_image_url), ''), nullif(trim(p_accent), ''),
    nullif(trim(p_title), ''), nullif(trim(p_artist_name), ''),
    nullif(trim(p_year), ''), trim(p_prompt), p_options, p_correct_index
  )
  returning * into row;

  return row_to_json(row);
end;
$$;

grant execute on function public.admin_add_daily_special(date, text, text, jsonb, int, text, text, text, text, text, text) to authenticated;

create or replace function public.admin_delete_daily_question(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  delete from public.daily_quiz_questions where id = p_id;
end;
$$;

grant execute on function public.admin_delete_daily_question(uuid) to authenticated;

-- Lock stops the cron from adding generated problems. Unlock lets the next run fill to 10.
create or replace function public.admin_set_daily_lock(p_date date, p_locked boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  insert into public.daily_quizzes (quiz_date, locked)
  values (p_date, p_locked)
  on conflict (quiz_date) do update set locked = excluded.locked;
end;
$$;

grant execute on function public.admin_set_daily_lock(date, boolean) to authenticated;
