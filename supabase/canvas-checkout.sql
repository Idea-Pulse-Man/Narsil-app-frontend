-- ===========================================================================
-- Narsil — Canvas checkout migration (Stripe payment → Printful fulfillment)
-- Safe to re-run. Run in the Supabase SQL Editor after schema.sql (+ the
-- roadmap migration, which adds artist_cut / platform_cut).
--
-- Order lifecycle with checkout enabled:
--   pending_payment  → row created together with the Stripe PaymentIntent
--   paid             → payment verified (transient, while Printful is called)
--   submitted        → Printful accepted the order (draft or confirmed)
--   fulfillment_failed → payment captured but Printful rejected; the backend
--                        retries on the next finalize call
--   shipped / completed / cancelled → as before ('registered' kept for
--                        legacy pre-checkout rows)
-- ===========================================================================

alter table public.canvas_orders add column if not exists stripe_payment_intent_id text;
alter table public.canvas_orders add column if not exists printful_order_id text;
alter table public.canvas_orders add column if not exists currency text not null default 'usd';
alter table public.canvas_orders add column if not exists paid_at timestamptz;
alter table public.canvas_orders add column if not exists fulfillment_error text;

-- Shipment tracking, filled in by the Printful status webhook
-- (package_shipped → carrier tracking number + link).
alter table public.canvas_orders add column if not exists tracking_number text;
alter table public.canvas_orders add column if not exists tracking_url text;
alter table public.canvas_orders add column if not exists shipped_at timestamptz;

-- One order per PaymentIntent (idempotency guard for webhook replays).
create unique index if not exists canvas_orders_payment_intent_idx
  on public.canvas_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Extend the status lifecycle with the checkout states.
alter table public.canvas_orders drop constraint if exists canvas_orders_status_check;
alter table public.canvas_orders add constraint canvas_orders_status_check
  check (status in (
    'registered',
    'pending_payment',
    'paid',
    'submitted',
    'fulfillment_failed',
    'completed',
    'shipped',
    'cancelled'
  ));

-- Orders are now created by the backend (service role) after server-side
-- price checks — the app no longer inserts them directly. Drop the permissive
-- ALL policy and keep user reads (order history) via a select-only policy.
drop policy if exists "Users manage their own canvas orders" on public.canvas_orders;
drop policy if exists "Users read their own canvas orders" on public.canvas_orders;
create policy "Users read their own canvas orders"
  on public.canvas_orders for select
  to authenticated
  using (auth.uid() = user_id);
