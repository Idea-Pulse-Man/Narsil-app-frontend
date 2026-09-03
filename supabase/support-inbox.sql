-- ===========================================================================
-- Narsil — Support inbox (email + live chat to admin)
-- ---------------------------------------------------------------------------
-- Members contact admins from Profile → Contact admin. Email opens mailto;
-- live chat writes rows here. Admins read/reply from the in-app Admin → Inbox.
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- REQUIRES: schema.sql → migrations-roadmap.sql
-- (Helpers below are redefined so this file still works if admin-dashboard.sql
--  has not been applied yet.)
-- ===========================================================================

-- ── Helpers (same as admin-dashboard.sql) ───────────────────────────────────

alter table public.profiles add column if not exists suspended_at timestamptz;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and suspended_at is not null
  );
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_suspended() to authenticated;

-- ── Table + RLS ─────────────────────────────────────────────────────────────

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  -- false = member message; true = admin reply (still keyed to the member thread)
  from_admin  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_user_created_idx
  on public.support_messages (user_id, created_at asc);

create index if not exists support_messages_inbox_idx
  on public.support_messages (created_at desc);

alter table public.support_messages enable row level security;

drop policy if exists "Users read own support messages" on public.support_messages;
create policy "Users read own support messages"
  on public.support_messages for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users send support messages" on public.support_messages;
create policy "Users send support messages"
  on public.support_messages for insert to authenticated
  with check (
    auth.uid() = user_id
    and from_admin = false
    and not public.is_suspended()
  );

drop policy if exists "Admins reply to support" on public.support_messages;
create policy "Admins reply to support"
  on public.support_messages for insert to authenticated
  with check (public.is_admin() and from_admin = true);

-- Newest message per member for the admin inbox list.
create or replace function public.admin_list_support_threads(
  page_limit  int default 30,
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

  select count(distinct user_id) into total from public.support_messages;

  select json_build_object(
    'rows', coalesce((
      select json_agg(row_to_json(t))
      from (
        select
          latest.user_id,
          p.full_name,
          p.email,
          latest.body as last_body,
          latest.from_admin as last_from_admin,
          latest.created_at as last_at,
          (
            select count(*)::int
            from public.support_messages s
            where s.user_id = latest.user_id
          ) as message_count
        from (
          select distinct on (user_id)
            user_id, body, from_admin, created_at
          from public.support_messages
          order by user_id, created_at desc
        ) latest
        left join public.profiles p on p.id = latest.user_id
        order by latest.created_at desc
        limit greatest(page_limit, 1)
        offset greatest(page_offset, 0)
      ) t
    ), '[]'::json),
    'total', total
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_list_support_threads(int, int) to authenticated;

create or replace function public.admin_list_support_thread(target_id uuid)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select json_agg(row_to_json(m) order by m.created_at asc)
    from (
      select id, user_id, body, from_admin, created_at
      from public.support_messages
      where user_id = target_id
      order by created_at asc
    ) m
  ), '[]'::json);
end;
$$;

grant execute on function public.admin_list_support_thread(uuid) to authenticated;
