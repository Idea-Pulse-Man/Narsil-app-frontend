-- ===========================================================================
-- Narsil — Admin alerts + per-user notification mute + inbox unread count
-- ---------------------------------------------------------------------------
-- • Global kill switch: app_settings.alerts_enabled (admin can disable all
--   alert toasts). Inbox badge still works when alerts are off.
-- • Per-user: profiles.notifications_disabled — admin mute for selected users.
-- • Unread inbox: threads whose last message is from a member (awaiting reply).
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- REQUIRES: support-inbox.sql, admin-exclude-guests.sql (is_registered_member,
--           admin_list_users), require_admin().
-- ===========================================================================

-- Global settings (one row per key).
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "admins read app_settings" on public.app_settings;
create policy "admins read app_settings"
  on public.app_settings for select to authenticated
  using (public.is_admin());

-- Writes only via security-definer RPCs.
revoke insert, update, delete on public.app_settings from authenticated, anon;

insert into public.app_settings (key, value)
values ('alerts', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

-- Per-user notification mute (admin-controlled).
alter table public.profiles
  add column if not exists notifications_disabled boolean not null default false;

-- ── RPCs ────────────────────────────────────────────────────────────────────

create or replace function public.admin_get_alerts_enabled()
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  enabled boolean;
begin
  perform public.require_admin();
  select coalesce((value->>'enabled')::boolean, true)
    into enabled
  from public.app_settings
  where key = 'alerts';
  return coalesce(enabled, true);
end;
$$;

grant execute on function public.admin_get_alerts_enabled() to authenticated;

create or replace function public.admin_set_alerts_enabled(enabled boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  insert into public.app_settings (key, value, updated_at)
  values ('alerts', jsonb_build_object('enabled', enabled), now())
  on conflict (key) do update
    set value = jsonb_build_object('enabled', enabled),
        updated_at = now();
end;
$$;

grant execute on function public.admin_set_alerts_enabled(boolean) to authenticated;

create or replace function public.admin_set_user_notifications(
  target_id uuid,
  disabled  boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  if target_id = auth.uid() and disabled then
    raise exception 'You cannot mute notifications for yourself.'
      using errcode = 'P0001';
  end if;
  update public.profiles
     set notifications_disabled = coalesce(disabled, false),
         updated_at = now()
   where id = target_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0001';
  end if;
end;
$$;

grant execute on function public.admin_set_user_notifications(uuid, boolean) to authenticated;

-- Threads waiting on admin (last message from member, not yet viewed).
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

-- Refresh admin_list_users so the Users tab shows notifications_disabled.
drop function if exists public.admin_list_users(text, int, int);
drop function if exists public.admin_list_users(text, int, int, text);

create or replace function public.admin_list_users(
  search        text default null,
  page_limit    int  default 30,
  page_offset   int  default 0,
  status_filter text default null
)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  q      text := nullif(trim(coalesce(search, '')), '');
  filt   text := nullif(trim(coalesce(status_filter, '')), '');
  total  bigint;
  rows   json;
begin
  perform public.require_admin();

  if filt is not null and filt not in ('active', 'paused', 'suspended', 'admin', 'guild', 'all') then
    raise exception 'Unknown filter: %', filt using errcode = '22023';
  end if;
  if filt = 'all' then filt := null; end if;

  select count(*) into total
  from public.profiles p
  left join lateral (
    select s.status, s.expires_at
    from public.subscriptions s
    where s.user_id = p.id
    order by
      case when s.status in ('active', 'grace') then 0 else 1 end,
      s.expires_at desc nulls last
    limit 1
  ) sub on true
  where public.is_registered_member(p.id)
    and (q is null
         or p.email ilike '%' || q || '%'
         or p.full_name ilike '%' || q || '%')
    and (
      filt is null
      or (filt = 'admin' and p.role = 'admin')
      or (filt = 'guild' and sub.status in ('active', 'grace')
          and sub.expires_at is not null and sub.expires_at > now())
      or (filt in ('active', 'paused', 'suspended') and p.account_status = filt)
    );

  select coalesce(json_agg(t), '[]'::json) into rows
  from (
    select
      p.id,
      p.full_name,
      p.email,
      p.avatar_url,
      p.role,
      p.account_status,
      p.suspended_at,
      p.terms_accepted_at,
      p.created_at,
      coalesce(p.notifications_disabled, false) as notifications_disabled,
      au.last_sign_in_at,
      (select count(*) from public.canvas_orders o where o.user_id = p.id) as order_count,
      (select count(*) from public.artworks a where a.created_by = p.id)   as artwork_count,
      coalesce(
        sub.status in ('active', 'grace')
          and sub.expires_at is not null
          and sub.expires_at > now(),
        false
      ) as is_subscriber,
      sub.status as subscription_status,
      sub.product_id as subscription_product,
      sub.expires_at as subscription_expires_at
    from public.profiles p
    left join auth.users au on au.id = p.id
    left join lateral (
      select s.status, s.product_id, s.expires_at
      from public.subscriptions s
      where s.user_id = p.id
      order by
        case when s.status in ('active', 'grace') then 0 else 1 end,
        s.expires_at desc nulls last
      limit 1
    ) sub on true
    where public.is_registered_member(p.id)
      and (q is null
           or p.email ilike '%' || q || '%'
           or p.full_name ilike '%' || q || '%')
      and (
        filt is null
        or (filt = 'admin' and p.role = 'admin')
        or (filt = 'guild' and sub.status in ('active', 'grace')
            and sub.expires_at is not null and sub.expires_at > now())
        or (filt in ('active', 'paused', 'suspended') and p.account_status = filt)
      )
    order by p.created_at desc
    limit  greatest(1, least(coalesce(page_limit, 30), 100))
    offset greatest(0, coalesce(page_offset, 0))
  ) t;

  return json_build_object('rows', rows, 'total', total);
end;
$$;

grant execute on function public.admin_list_users(text, int, int, text) to authenticated;
