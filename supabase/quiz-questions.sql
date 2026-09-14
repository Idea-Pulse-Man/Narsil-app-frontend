-- ===========================================================================
-- Narsil — authored quiz question bank (admin Quiz tab)
-- ---------------------------------------------------------------------------
-- Members can SELECT rows for live topic quizzes. Admins insert / delete via
-- security-definer RPCs.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run.
-- ===========================================================================

create table if not exists public.quiz_questions (
  id             uuid primary key default gen_random_uuid(),
  topic_kind     text not null check (topic_kind in ('age', 'empire')),
  topic_id       text not null,
  difficulty     text not null check (difficulty in ('apprentice', 'scholar', 'master')),
  mode           text not null,
  artwork_id     text,
  prompt         text not null check (char_length(trim(prompt)) between 1 and 500),
  options        jsonb not null,
  correct_index  smallint not null check (correct_index between 0 and 3),
  created_at     timestamptz not null default now(),
  constraint quiz_questions_options_len check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4)
);

create index if not exists quiz_questions_topic_idx
  on public.quiz_questions (topic_kind, topic_id, difficulty, created_at desc);

alter table public.quiz_questions enable row level security;

drop policy if exists "Anyone authenticated can read quiz questions" on public.quiz_questions;
create policy "Anyone authenticated can read quiz questions"
  on public.quiz_questions for select to authenticated
  using (true);

drop policy if exists "Admins insert quiz questions" on public.quiz_questions;
create policy "Admins insert quiz questions"
  on public.quiz_questions for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Admins delete quiz questions" on public.quiz_questions;
create policy "Admins delete quiz questions"
  on public.quiz_questions for delete to authenticated
  using (public.is_admin());

-- Admin list (paged, optional topic / difficulty filters).
create or replace function public.admin_list_quiz_questions(
  topic_kind_filter text default null,
  topic_id_filter   text default null,
  difficulty_filter text default null,
  page_limit        int  default 30,
  page_offset       int  default 0
)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  result json;
  total  int;
begin
  perform public.require_admin();

  select count(*)::int into total
  from public.quiz_questions q
  where (topic_kind_filter is null or q.topic_kind = topic_kind_filter)
    and (topic_id_filter is null or q.topic_id = topic_id_filter)
    and (difficulty_filter is null or q.difficulty = difficulty_filter);

  select json_build_object(
    'rows', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          q.id,
          q.topic_kind,
          q.topic_id,
          q.difficulty,
          q.mode,
          q.artwork_id,
          q.prompt,
          q.options,
          q.correct_index,
          q.created_at
        from public.quiz_questions q
        where (topic_kind_filter is null or q.topic_kind = topic_kind_filter)
          and (topic_id_filter is null or q.topic_id = topic_id_filter)
          and (difficulty_filter is null or q.difficulty = difficulty_filter)
        order by q.created_at desc
        limit greatest(page_limit, 1)
        offset greatest(page_offset, 0)
      ) t
    ), '[]'::json),
    'total', total
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_quiz_questions(text, text, text, int, int) to authenticated;

create or replace function public.admin_insert_quiz_question(
  p_topic_kind    text,
  p_topic_id      text,
  p_difficulty    text,
  p_mode          text,
  p_prompt        text,
  p_options       jsonb,
  p_correct_index int,
  p_artwork_id    text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  row public.quiz_questions;
begin
  perform public.require_admin();

  insert into public.quiz_questions (
    topic_kind, topic_id, difficulty, mode, artwork_id,
    prompt, options, correct_index
  ) values (
    p_topic_kind, p_topic_id, p_difficulty, p_mode, nullif(trim(p_artwork_id), ''),
    trim(p_prompt), p_options, p_correct_index
  )
  returning * into row;

  return row_to_json(row);
end;
$$;

grant execute on function public.admin_insert_quiz_question(text, text, text, text, text, jsonb, int, text) to authenticated;

create or replace function public.admin_delete_quiz_question(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  delete from public.quiz_questions where id = target_id;
end;
$$;

grant execute on function public.admin_delete_quiz_question(uuid) to authenticated;

-- Member/live quiz: load bank rows for a topic trial.
create or replace function public.list_quiz_questions_for_topic(
  p_topic_kind text,
  p_topic_id   text,
  p_difficulty text
)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.created_at asc)
    from (
      select
        id, topic_kind, topic_id, difficulty, mode, artwork_id,
        prompt, options, correct_index, created_at
      from public.quiz_questions
      where topic_kind = p_topic_kind
        and topic_id = p_topic_id
        and difficulty = p_difficulty
      order by created_at asc
      limit 40
    ) t
  ), '[]'::json);
end;
$$;

grant execute on function public.list_quiz_questions_for_topic(text, text, text) to authenticated;

notify pgrst, 'reload schema';
