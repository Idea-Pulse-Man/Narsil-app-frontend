-- ===========================================================================
-- Narsil — Admin Overview charts (users / sign-ins / subscriptions)
-- ---------------------------------------------------------------------------
-- Extends admin_stats() with:
--   • today / yesterday new-user counts + day-over-day delta
--   • last-14-day sign-in series (auth.users.last_sign_in_at)
--   • last-14-day new-subscription series (subscriptions.created_at)
--   • currently entitled Pro subscribers
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- REQUIRES: admin-dashboard.sql (or support-inbox helpers) + subscriptions.sql
--           + artwork-approval.sql (pending_approvals column optional)
-- ===========================================================================

create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  paid_states text[] := array['paid', 'submitted', 'shipped', 'completed'];
  today date := (timezone('utc', now()))::date;
  yesterday date := today - 1;
  users_total int;
  users_today int;
  users_yesterday int;
  signins_today int;
  signins_yesterday int;
  pending_count int;
begin
  perform public.require_admin();

  select count(*)::int into users_total from public.profiles;

  select count(*)::int into users_today
  from public.profiles
  where (created_at at time zone 'utc')::date = today;

  select count(*)::int into users_yesterday
  from public.profiles
  where (created_at at time zone 'utc')::date = yesterday;

  select count(*)::int into signins_today
  from auth.users u
  where u.last_sign_in_at is not null
    and (u.last_sign_in_at at time zone 'utc')::date = today;

  select count(*)::int into signins_yesterday
  from auth.users u
  where u.last_sign_in_at is not null
    and (u.last_sign_in_at at time zone 'utc')::date = yesterday;

  begin
    select count(*)::int into pending_count
    from public.artworks
    where approval_status = 'pending';
  exception
    when undefined_column then
      pending_count := 0;
  end;

  return json_build_object(
    -- Hero: Narsil membership
    'users', users_total,
    'users_today', users_today,
    'users_yesterday', users_yesterday,
    'users_delta', users_today - users_yesterday,
    'signins_today', signins_today,
    'signins_yesterday', signins_yesterday,
    'signins_delta', signins_today - signins_yesterday,

    'admins',     (select count(*) from public.profiles where role = 'admin'),
    'suspended',  (select count(*) from public.profiles where suspended_at is not null),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),

    -- Pro
    'subscribers_active', (
      select count(*)::int from public.subscriptions s
      where s.status in ('active', 'grace')
        and s.expires_at is not null
        and s.expires_at > now()
    ),
    'subscribers_today', (
      select count(*)::int from public.subscriptions s
      where (s.created_at at time zone 'utc')::date = today
    ),
    'subscribers_yesterday', (
      select count(*)::int from public.subscriptions s
      where (s.created_at at time zone 'utc')::date = yesterday
    ),

    -- 14-day charts (oldest → newest)
    'signins_by_day', (
      select coalesce(json_agg(json_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::json)
      from (
        select
          to_char(gs.d, 'YYYY-MM-DD') as day,
          (
            select count(*)::int
            from auth.users u
            where u.last_sign_in_at is not null
              and (u.last_sign_in_at at time zone 'utc')::date = gs.d
          ) as n
        from generate_series(today - 13, today, interval '1 day') as g(ts)
        cross join lateral (select g.ts::date as d) gs
      ) d
    ),
    'subscriptions_by_day', (
      select coalesce(json_agg(json_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::json)
      from (
        select
          to_char(gs.d, 'YYYY-MM-DD') as day,
          (
            select count(*)::int
            from public.subscriptions s
            where (s.created_at at time zone 'utc')::date = gs.d
          ) as n
        from generate_series(today - 13, today, interval '1 day') as g(ts)
        cross join lateral (select g.ts::date as d) gs
      ) d
    ),
    'signups_by_day', (
      select coalesce(json_agg(json_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::json)
      from (
        select
          to_char(gs.d, 'YYYY-MM-DD') as day,
          (
            select count(*)::int
            from public.profiles p
            where (p.created_at at time zone 'utc')::date = gs.d
          ) as n
        from generate_series(today - 13, today, interval '1 day') as g(ts)
        cross join lateral (select g.ts::date as d) gs
      ) d
    ),

    'artworks',   (select count(*) from public.artworks),
    'hidden',     (select count(*) from public.artworks where hidden),
    'featured',   (select count(*) from public.artworks where featured),
    'for_sale',   (select count(*) from public.artworks where for_sale),
    'pending_approvals', pending_count,
    'orders',     (select count(*) from public.canvas_orders),
    'orders_by_status', (
      select coalesce(json_object_agg(s.status, s.n), '{}'::json)
      from (select status, count(*) as n from public.canvas_orders group by status) s
    ),
    'needs_attention', (
      select count(*) from public.canvas_orders
      where status in ('fulfillment_failed', 'paid')
    ),
    'revenue',       (select coalesce(sum(price), 0)        from public.canvas_orders where status = any(paid_states)),
    'artist_payout', (select coalesce(sum(artist_cut), 0)   from public.canvas_orders where status = any(paid_states)),
    'platform_cut',  (select coalesce(sum(platform_cut), 0) from public.canvas_orders where status = any(paid_states))
  );
end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- Admins may list all subscription rows for reporting (writes stay service-role).
drop policy if exists "Admins read subscriptions" on public.subscriptions;
create policy "Admins read subscriptions"
  on public.subscriptions for select
  to authenticated
  using (public.is_admin());
