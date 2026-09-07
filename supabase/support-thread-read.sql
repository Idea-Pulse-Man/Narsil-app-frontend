-- Mark support threads as read when an admin opens them.
-- Unread badge = threads with a newer member message than last admin view.
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.support_thread_reads (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  read_at  timestamptz not null default now()
);

alter table public.support_thread_reads enable row level security;

drop policy if exists "Admins manage support reads" on public.support_thread_reads;
create policy "Admins manage support reads"
  on public.support_thread_reads for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.admin_mark_support_thread_read(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  if target_id is null then
    raise exception 'target_id required';
  end if;
  insert into public.support_thread_reads (user_id, read_at)
  values (target_id, now())
  on conflict (user_id) do update
    set read_at = greatest(public.support_thread_reads.read_at, excluded.read_at);
end;
$$;

grant execute on function public.admin_mark_support_thread_read(uuid) to authenticated;

-- Unread = last message from member AND newer than admin's last read.
create or replace function public.admin_unread_support_count()
returns int
language plpgsql
stable
security definer set search_path = public
as $$
declare
  n int;
begin
  perform public.require_admin();
  select count(*)::int into n
  from (
    select distinct on (m.user_id)
      m.user_id,
      m.from_admin,
      m.created_at
    from public.support_messages m
    order by m.user_id, m.created_at desc
  ) last
  left join public.support_thread_reads r on r.user_id = last.user_id
  where last.from_admin = false
    and (r.read_at is null or last.created_at > r.read_at);
  return coalesce(n, 0);
end;
$$;

grant execute on function public.admin_unread_support_count() to authenticated;

-- Include unread flag on inbox list rows.
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
          ) as message_count,
          (
            latest.from_admin = false
            and (
              r.read_at is null
              or latest.created_at > r.read_at
            )
          ) as unread
        from (
          select distinct on (user_id)
            user_id, body, from_admin, created_at
          from public.support_messages
          order by user_id, created_at desc
        ) latest
        left join public.profiles p on p.id = latest.user_id
        left join public.support_thread_reads r on r.user_id = latest.user_id
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

notify pgrst, 'reload schema';
