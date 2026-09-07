-- ===========================================================================
-- Narsil — Richer admin Users management
-- ---------------------------------------------------------------------------
-- Adds account_status (active / paused / suspended), enriches admin_list_users
-- with subscription + last sign-in, and an RPC to set status safely.
--
-- Status meaning:
--   active    — "good" / normal member
--   paused    — soft hold (can't post / upload; can still browse)
--   suspended — hard hold (same content block; shown as Suspended in admin)
-- Role (user / admin) stays independent — an admin can be paused too.
--
-- HOW TO RUN: Supabase → SQL Editor → paste → Run. Safe to re-run.
-- REQUIRES: admin-dashboard.sql + subscriptions.sql
-- ===========================================================================

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'paused', 'suspended'));

-- Backfill from the older suspended_at flag.
update public.profiles
set account_status = 'suspended'
where suspended_at is not null
  and account_status = 'active';

create index if not exists profiles_account_status_idx
  on public.profiles (account_status);

-- Content block: paused OR suspended (and legacy suspended_at).
create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        suspended_at is not null
        or account_status in ('paused', 'suspended')
      )
  );
$$;

grant execute on function public.is_suspended() to authenticated;

-- Set status. Keeps suspended_at in sync for older readers.
create or replace function public.admin_set_account_status(
  target_id uuid,
  new_status text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();

  if new_status not in ('active', 'paused', 'suspended') then
    raise exception 'Unknown status: %', new_status using errcode = '22023';
  end if;

  if target_id = auth.uid() and new_status <> 'active' then
    raise exception 'You cannot pause or suspend yourself.' using errcode = '22023';
  end if;

  update public.profiles
     set account_status = new_status,
         suspended_at   = case
                            when new_status = 'suspended' then coalesce(suspended_at, now())
                            else null
                          end,
         updated_at     = now()
   where id = target_id;

  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.admin_set_account_status(uuid, text) to authenticated;

-- Keep the old suspend RPC, but drive it through account_status.
create or replace function public.admin_set_user_suspended(
  target_id uuid,
  suspended boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.admin_set_account_status(
    target_id,
    case when suspended then 'suspended' else 'active' end
  );
end;
$$;

-- Enriched, filterable user list.
-- Drop prior overloads so PostgREST binds a single function.
drop function if exists public.admin_list_users(text, int, int);
drop function if exists public.admin_list_users(text, text, int, int);

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
  where (q is null
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
    where (q is null
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
