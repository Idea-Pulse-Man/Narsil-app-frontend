-- ===========================================================================
-- Narsil — first-party usage analytics + error log
-- Safe to re-run. Run in the Supabase SQL Editor after admin-dashboard.sql.
--
-- The app batches anonymous events ("screen_view", "checkout_paid", …) and
-- errors to the backend (POST /api/telemetry), which writes them here with
-- the service role. Server 5xx errors land in app_errors too (source
-- 'server'). Rows carry a random per-install id, never a user id or IP.
-- The backend deletes rows older than 90 days.
--
-- Nobody but the service role can read or write these tables directly; the
-- admin Insights tab reads them through admin_insights().
-- ===========================================================================

create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  install_id  text not null,
  session_id  text,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  platform    text,
  app_version text
);

create index if not exists app_events_created_idx on public.app_events (created_at desc);
create index if not exists app_events_name_idx on public.app_events (name, created_at desc);

create table if not exists public.app_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null default 'app' check (source in ('app', 'server')),
  message     text not null,
  context     text,
  stack       text,
  url         text,
  install_id  text,
  platform    text,
  app_version text
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

alter table public.app_events enable row level security;
alter table public.app_errors enable row level security;
revoke all on public.app_events from anon, authenticated;
revoke all on public.app_errors from anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_insights(p_days) — everything the Insights tab shows, in one call.
-- ---------------------------------------------------------------------------
create or replace function public.admin_insights(p_days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'days', greatest(1, least(p_days, 90)),
    'installs', (select count(distinct install_id) from app_events where created_at >= since),
    'sessions', (select count(distinct session_id) from app_events where created_at >= since),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'installs', n) order by d)
      from (
        select date_trunc('day', created_at)::date as d, count(distinct install_id) as n
        from app_events where created_at >= since group by 1
      ) x
    ), '[]'::jsonb),
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('screen', screen, 'views', n) order by n desc)
      from (
        select props->>'screen' as screen, count(*) as n
        from app_events
        where created_at >= since and name = 'screen_view'
        group by 1
      ) x
    ), '[]'::jsonb),
    -- Funnels count sessions, so one person opening a sheet twice counts once.
    'checkout', jsonb_build_object(
      'opened',  (select count(distinct session_id) from app_events where created_at >= since and name = 'checkout_open'),
      'payment', (select count(distinct session_id) from app_events where created_at >= since and name = 'checkout_payment'),
      'paid',    (select count(distinct session_id) from app_events where created_at >= since and name = 'checkout_paid')
    ),
    'pro', jsonb_build_object(
      'paywall',    (select count(distinct session_id) from app_events where created_at >= since and name = 'paywall_open'),
      'subscribed', (select count(distinct session_id) from app_events where created_at >= since and name = 'pro_subscribed')
    ),
    'shares', (select count(*) from app_events where created_at >= since and name = 'share_artwork'),
    'errors', coalesce((
      select jsonb_agg(e order by (e->>'count')::int desc)
      from (
        select jsonb_build_object(
          'message', message,
          'source', source,
          'count', count(*),
          'installs', count(distinct install_id),
          'last_seen', max(created_at),
          'context', (array_agg(context order by created_at desc))[1],
          'stack', (array_agg(stack order by created_at desc))[1]
        ) as e
        from app_errors
        where created_at >= since
        group by message, source
        order by count(*) desc
        limit 25
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.admin_insights(int) to authenticated;
