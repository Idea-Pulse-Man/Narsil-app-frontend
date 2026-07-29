-- ===========================================================================
-- Narsil Pro — Apple auto-renewing subscription entitlement
-- Safe to re-run. Run in the Supabase SQL Editor after canvas-checkout.sql.
--
-- One row per Apple subscriber, keyed by `original_transaction_id` — the id
-- Apple keeps stable across renewals, upgrades, restores and reinstalls. That
-- uniqueness is what makes "Restore Purchases" work after a reinstall, and
-- what stops the same Apple subscription being claimed by two accounts.
--
-- Rows are written ONLY by the backend (service role), from two sources:
--   POST /api/apple/verify         — the app hands over a signed transaction
--   POST /api/apple/notifications  — App Store Server Notifications V2
-- The app never writes here; it reads its own row via GET /api/me/subscription.
--
-- Status lifecycle:
--   active   → paid and current
--   grace    → billing failed, Apple is retrying (still entitled — Apple
--              retries for up to 60 days and revoking early punishes users
--              whose card merely expired)
--   expired  → lapsed or cancelled at period end
--   revoked  → refunded or family-sharing revoked (entitlement removed at once)
-- ===========================================================================

create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  original_transaction_id text not null,
  product_id              text not null,
  status                  text not null default 'active',
  expires_at              timestamptz,
  auto_renew              boolean not null default true,
  environment             text not null default 'Production',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Apple's stable subscriber id — one row per subscription, ever.
create unique index if not exists subscriptions_original_txn_idx
  on public.subscriptions (original_transaction_id);

-- The lookup isSubscriber() makes on every checkout and gated download.
create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status, expires_at desc);

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'grace', 'expired', 'revoked'));

alter table public.subscriptions drop constraint if exists subscriptions_environment_check;
alter table public.subscriptions add constraint subscriptions_environment_check
  check (environment in ('Production', 'Sandbox'));

-- ---------------------------------------------------------------------------
-- RLS — users may read their own entitlement (so the app can render Pro state
-- offline from Supabase directly); all writes are service-role only.
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;

drop policy if exists "Users read their own subscription" on public.subscriptions;
create policy "Users read their own subscription"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Entitlement predicate, mirrored in TS as services/subscriptions.ts
-- `isSubscriber()`. Defined here too so RLS policies and reporting queries can
-- use the same rule instead of re-deriving it.
--
-- `grace` counts as entitled; a NULL expires_at never does (a row that lost its
-- expiry is treated as unknown, not as permanently free).
-- ---------------------------------------------------------------------------
create or replace function public.is_subscriber(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.status in ('active', 'grace')
      and s.expires_at is not null
      and s.expires_at > now()
  );
$$;

grant execute on function public.is_subscriber(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Canvas orders record what discount was applied, so accounting can separate
-- "sold at list" from "sold to a Pro subscriber" without re-deriving it from
-- the subscription table's state at some later date.
-- ---------------------------------------------------------------------------
alter table public.canvas_orders
  add column if not exists discount_pct numeric not null default 0;

alter table public.canvas_orders
  add column if not exists list_price numeric;

comment on column public.canvas_orders.discount_pct is
  'Percent discount applied at purchase (20 for Narsil Pro, 0 otherwise).';
comment on column public.canvas_orders.list_price is
  'Undiscounted price. The artist revenue split is computed from THIS, so a '
  'subscriber discount comes out of the platform cut, never the artist''s.';
