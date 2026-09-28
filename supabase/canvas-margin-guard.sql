-- ===========================================================================
-- Narsil — Canvas margin guard
-- Safe to re-run. Run in the Supabase SQL Editor after admin-dashboard.sql
-- (for public.is_admin()) and canvas-checkout.sql.
--
-- 1. Artists can edit their own `artists` row ("Users manage their own
--    artist profile"), which includes revenue_share_pct. Left alone, an
--    artist could set 100% and Narsil would pay Printful's print + shipping
--    on every sale of their work. This trigger stops anyone but an admin (or
--    the backend's service role) from setting it above 30%. The backend also
--    caps it at checkout (MAX_ARTIST_SHARE_PCT in services/pricing.ts).
--
-- 2. canvas_orders.printful_cost — what Printful actually billed for the
--    order (print + shipping to the real address + tax), written by the
--    backend at fulfillment. Compare it with `price` to see the real margin.
-- ===========================================================================

create or replace function public.guard_artist_revenue_share()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- The backend (service_role) and the SQL editor (no JWT) are trusted.
  if coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.revenue_share_pct > 30
     and (tg_op = 'INSERT' or new.revenue_share_pct is distinct from old.revenue_share_pct) then
    raise exception 'revenue_share_pct above 30 can only be set by an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_artist_revenue_share on public.artists;
create trigger guard_artist_revenue_share
  before insert or update of revenue_share_pct on public.artists
  for each row execute function public.guard_artist_revenue_share();

-- Find any artist already above the cap (the backend caps them anyway):
--   select id, name, revenue_share_pct from public.artists where revenue_share_pct > 30;

alter table public.canvas_orders add column if not exists printful_cost numeric(10,2);

-- Real margin per fulfilled order (before artist payouts), newest first:
--   select id, size, price, printful_cost,
--          round(price - printful_cost - (price * 0.029 + 0.30), 2) as net
--   from public.canvas_orders
--   where printful_cost is not null
--   order by created_at desc;
