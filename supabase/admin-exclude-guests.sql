-- ===========================================================================
-- Narsil — Members vs guests in admin metrics + hide guests from Users
-- ---------------------------------------------------------------------------
-- • "Total users" / new-user deltas count REGISTERED members only (email set,
--   not anonymous). Guests are tracked separately and do not inflate totals.
-- • Sign-in chart returns stacked members + guests per day (different colors
--   in the app).
-- • admin_list_users excludes guests so the Users tab only shows real accounts.
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- REQUIRES: admin-overview-charts.sql + admin-users-enrich.sql
-- ===========================================================================

-- True when this auth user is a real member (not an anonymous guest).
create or replace function public.is_registered_member(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from auth.users au
    where au.id = uid
      and coalesce(au.is_anonymous, false) = false
      and nullif(trim(coalesce(au.email, '')), '') is not null
  );
$$;

grant execute on function public.is_registered_member(uuid) to authenticated;

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
  guests_total int;
  guests_today int;
  signins_members_today int;
  signins_guests_today int;
  signins_yesterday int;
  pending_count int;
begin
  perform public.require_admin();

  select count(*)::int into users_total
  from public.profiles p
  where public.is_registered_member(p.id);

  select count(*)::int into users_today
  from public.profiles p
  where public.is_registered_member(p.id)
    and (p.created_at at time zone 'utc')::date = today;

  select count(*)::int into users_yesterday
  from public.profiles p
  where public.is_registered_member(p.id)
    and (p.created_at at time zone 'utc')::date = yesterday;

  select count(*)::int into guests_total
  from auth.users au
  where coalesce(au.is_anonymous, false) = true
     or nullif(trim(coalesce(au.email, '')), '') is null;

  select count(*)::int into guests_today
  from auth.users au
  where (coalesce(au.is_anonymous, false) = true
         or nullif(trim(coalesce(au.email, '')), '') is null)
    and (au.created_at at time zone 'utc')::date = today;

  select count(*)::int into signins_members_today
  from auth.users au
  where au.last_sign_in_at is not null
    and (au.last_sign_in_at at time zone 'utc')::date = today
    and public.is_registered_member(au.id);

  select count(*)::int into signins_guests_today
  from auth.users au
  where au.last_sign_in_at is not null
    and (au.last_sign_in_at at time zone 'utc')::date = today
    and not public.is_registered_member(au.id);

  select count(*)::int into signins_yesterday
  from auth.users au
  where au.last_sign_in_at is not null
    and (au.last_sign_in_at at time zone 'utc')::date = yesterday;

  begin
    select count(*)::int into pending_count
    from public.artworks
    where approval_status = 'pending';
  exception
    when undefined_column then
      pending_count := 0;
  end;

  return json_build_object(
    -- Hero: registered members only
    'users', users_total,
    'users_today', users_today,
    'users_yesterday', users_yesterday,
    'users_delta', users_today - users_yesterday,
    'guests', guests_total,
    'guests_today', guests_today,

    'signins_today', signins_members_today + signins_guests_today,
    'signins_members_today', signins_members_today,
    'signins_guests_today', signins_guests_today,
    'signins_yesterday', signins_yesterday,
    'signins_delta', (signins_members_today + signins_guests_today) - signins_yesterday,

    'admins', (
      select count(*) from public.profiles p
      where p.role = 'admin' and public.is_registered_member(p.id)
    ),
    'suspended', (
      select count(*) from public.profiles p
      where public.is_registered_member(p.id)
        and (p.suspended_at is not null or p.account_status in ('paused', 'suspended'))
    ),
    'new_users_7d', (
      select count(*) from public.profiles p
      where public.is_registered_member(p.id)
        and p.created_at > now() - interval '7 days'
    ),

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

    -- Stacked sign-ins: members + guests
    'signins_by_day', (
      select coalesce(json_agg(json_build_object(
        'day', d.day,
        'members', d.members,
        'guests', d.guests,
        'count', d.members  -- legacy: members only
      ) order by d.day), '[]'::json)
      from (
        select
          to_char(gs.d, 'YYYY-MM-DD') as day,
          (
            select count(*)::int from auth.users au
            where au.last_sign_in_at is not null
              and (au.last_sign_in_at at time zone 'utc')::date = gs.d
              and public.is_registered_member(au.id)
          ) as members,
          (
            select count(*)::int from auth.users au
            where au.last_sign_in_at is not null
              and (au.last_sign_in_at at time zone 'utc')::date = gs.d
              and not public.is_registered_member(au.id)
          ) as guests
        from generate_series(today - 364, today, interval '1 day') as g(ts)
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
        from generate_series(today - 364, today, interval '1 day') as g(ts)
        cross join lateral (select g.ts::date as d) gs
      ) d
    ),
    -- New accounts created each day: members + guests
    'signups_by_day', (
      select coalesce(json_agg(json_build_object(
        'day', d.day,
        'members', d.members,
        'guests', d.guests,
        'count', d.members
      ) order by d.day), '[]'::json)
      from (
        select
          to_char(gs.d, 'YYYY-MM-DD') as day,
          (
            select count(*)::int
            from public.profiles p
            where public.is_registered_member(p.id)
              and (p.created_at at time zone 'utc')::date = gs.d
          ) as members,
          (
            select count(*)::int
            from auth.users au
            where not public.is_registered_member(au.id)
              and (au.created_at at time zone 'utc')::date = gs.d
          ) as guests
        from generate_series(today - 364, today, interval '1 day') as g(ts)
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

-- Hide guests from the Users tab.
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
