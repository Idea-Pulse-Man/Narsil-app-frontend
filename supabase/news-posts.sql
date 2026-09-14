-- ===========================================================================
-- Narsil — News posts (admin News tab + member read)
-- ---------------------------------------------------------------------------
-- Admins create / edit / save / delete. Members only see published posts.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ===========================================================================

create table if not exists public.news_posts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(trim(title)) between 1 and 200),
  body         text not null check (char_length(trim(body)) between 1 and 20000),
  image_url    text,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists news_posts_published_idx
  on public.news_posts (published, updated_at desc);

alter table public.news_posts enable row level security;

drop policy if exists "Anyone authenticated can read published news" on public.news_posts;
create policy "Anyone authenticated can read published news"
  on public.news_posts for select to authenticated
  using (published = true or public.is_admin());

drop policy if exists "Admins insert news" on public.news_posts;
create policy "Admins insert news"
  on public.news_posts for insert to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update news" on public.news_posts;
create policy "Admins update news"
  on public.news_posts for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete news" on public.news_posts;
create policy "Admins delete news"
  on public.news_posts for delete to authenticated
  using (public.is_admin());

create or replace function public.admin_list_news_posts(
  page_limit  int default 50,
  page_offset int default 0
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

  select count(*)::int into total from public.news_posts;

  select json_build_object(
    'rows', coalesce((
      select json_agg(row_to_json(t))
      from (
        select id, title, body, image_url, published, created_at, updated_at
        from public.news_posts
        order by updated_at desc
        limit greatest(page_limit, 1)
        offset greatest(page_offset, 0)
      ) t
    ), '[]'::json),
    'total', total
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_news_posts(int, int) to authenticated;

create or replace function public.admin_upsert_news_post(
  p_id        uuid default null,
  p_title     text default '',
  p_body      text default '',
  p_image_url text default null,
  p_published boolean default false
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  row public.news_posts;
begin
  perform public.require_admin();

  if p_id is null then
    insert into public.news_posts (title, body, image_url, published)
    values (
      trim(p_title),
      trim(p_body),
      nullif(trim(coalesce(p_image_url, '')), ''),
      coalesce(p_published, false)
    )
    returning * into row;
  else
    update public.news_posts
    set
      title = trim(p_title),
      body = trim(p_body),
      image_url = nullif(trim(coalesce(p_image_url, '')), ''),
      published = coalesce(p_published, false),
      updated_at = now()
    where id = p_id
    returning * into row;

    if row.id is null then
      raise exception 'News post not found';
    end if;
  end if;

  return row_to_json(row);
end;
$$;

grant execute on function public.admin_upsert_news_post(uuid, text, text, text, boolean) to authenticated;

create or replace function public.admin_delete_news_post(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  delete from public.news_posts where id = target_id;
end;
$$;

grant execute on function public.admin_delete_news_post(uuid) to authenticated;

-- Member: published posts only.
create or replace function public.list_published_news(page_limit int default 30)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.updated_at desc)
    from (
      select id, title, body, image_url, published, created_at, updated_at
      from public.news_posts
      where published = true
      order by updated_at desc
      limit greatest(page_limit, 1)
    ) t
  ), '[]'::json);
end;
$$;

grant execute on function public.list_published_news(int) to authenticated;
grant execute on function public.list_published_news(int) to anon;

notify pgrst, 'reload schema';
