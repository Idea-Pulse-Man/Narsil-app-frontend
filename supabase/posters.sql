-- ===========================================================================
-- Narsil — posters alongside canvas prints
-- Safe to re-run. Run in the Supabase SQL Editor after canvas-checkout.sql.
--
-- canvas_orders now holds both products. `product` says which one; every
-- existing row is a canvas. Sizes stay Small / Medium / Large (12×16, 18×24,
-- 24×36) for both. The backend only writes this column for posters, so canvas
-- checkout keeps working on a database that hasn't run this file yet —
-- poster checkout needs it.
-- ===========================================================================

alter table public.canvas_orders
  add column if not exists product text not null default 'canvas';

alter table public.canvas_orders
  drop constraint if exists canvas_orders_product_check;

alter table public.canvas_orders
  add constraint canvas_orders_product_check
  check (product in ('canvas', 'poster'));

-- Admin order list, now with `product` (otherwise identical to the version in
-- admin-dashboard.sql, which this replaces).
create or replace function public.admin_list_orders(
  status_filter text default null,
  page_limit    int  default 30,
  page_offset   int  default 0
)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  f     text := nullif(trim(coalesce(status_filter, '')), '');
  total bigint;
  rows  json;
begin
  perform public.require_admin();

  select count(*) into total
  from public.canvas_orders o
  where f is null or o.status = f;

  select coalesce(json_agg(t), '[]'::json) into rows
  from (
    select o.id,
           o.user_id,
           p.email                as buyer_email,
           p.full_name            as buyer_name,
           o.artwork_id,
           a.title                as artwork_title,
           o.product,
           o.size,
           o.price,
           o.currency,
           o.status,
           o.artist_cut,
           o.platform_cut,
           o.stripe_payment_intent_id,
           o.printful_order_id,
           o.fulfillment_error,
           o.tracking_number,
           o.tracking_url,
           o.paid_at,
           o.shipped_at,
           o.created_at
    from public.canvas_orders o
    left join public.profiles p on p.id = o.user_id
    left join public.artworks a on a.id = o.artwork_id
    where f is null or o.status = f
    order by o.created_at desc
    limit  greatest(1, least(coalesce(page_limit, 30), 100))
    offset greatest(0, coalesce(page_offset, 0))
  ) t;

  return json_build_object('rows', rows, 'total', total);
end;
$$;

grant execute on function public.admin_list_orders(text, int, int) to authenticated;
