-- ===========================================================================
-- Narsil — Admin dashboard migration
-- ---------------------------------------------------------------------------
-- Backs the in-app admin dashboard (AdminView): user management, artwork
-- moderation and canvas-order management. Everything an admin can do is
-- enforced HERE, in RLS + security-definer RPCs — the client UI is only a
-- convenience, never the gate.
--
-- Also closes a privilege-escalation hole: `migrations-roadmap.sql` added
-- `profiles.role`, but schema.sql's "Users can update their own profile"
-- policy has no column restriction, so any signed-in user (anonymous guests
-- included — they hold the `authenticated` role) could PATCH their own row to
-- role='admin' with the public anon key. Section 1 removes the blanket UPDATE
-- grant and hands back only the columns users legitimately edit; role and
-- suspension now move exclusively through the admin RPCs below.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run (if not exists / or replace / drop policy if exists).
--
-- REQUIRES: schema.sql → catalog-columns.sql → migrations-roadmap.sql
-- ===========================================================================

-- ===========================================================================
-- 1. LOCK DOWN profiles.role  (privilege-escalation fix)
-- ---------------------------------------------------------------------------
-- Column-level REVOKE cannot carve a hole out of a table-level grant, so the
-- table-wide UPDATE is dropped first and the safe columns granted back.
-- ===========================================================================

alter table public.profiles add column if not exists suspended_at timestamptz;

revoke update on public.profiles from authenticated, anon;

grant update (full_name, avatar_url, email, terms_accepted_at, terms_version, updated_at)
  on public.profiles to authenticated;

-- ===========================================================================
-- 2. HELPERS
-- ===========================================================================

-- Recreated here so this file stands alone if the roadmap migration is skipped.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- True when the caller has been suspended by an admin. Used by the content
-- policies below so a suspended account can still browse but not contribute.
create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and suspended_at is not null
  );
$$;

-- Raises unless the caller is an admin. Every RPC below starts with this.
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_suspended() to authenticated;

-- ===========================================================================
-- 3. USER MANAGEMENT
-- ===========================================================================

-- Admins can read every profile (the owner-only select policy stays for users).
drop policy if exists "Admins read all profiles" on public.profiles;
create policy "Admins read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- Paged + searchable user list with per-user activity counts. Security definer
-- so the counts can span other users' orders/artworks, which RLS would hide.
create or replace function public.admin_list_users(
  search      text default null,
  page_limit  int  default 30,
  page_offset int  default 0
)
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  q     text := nullif(trim(coalesce(search, '')), '');
  total bigint;
  rows  json;
begin
  perform public.require_admin();

  select count(*) into total
  from public.profiles p
  where q is null
     or p.email ilike '%' || q || '%'
     or p.full_name ilike '%' || q || '%';

  select coalesce(json_agg(t), '[]'::json) into rows
  from (
    select p.id,
           p.full_name,
           p.email,
           p.avatar_url,
           p.role,
           p.suspended_at,
           p.terms_accepted_at,
           p.created_at,
           (select count(*) from public.canvas_orders o where o.user_id = p.id) as order_count,
           (select count(*) from public.artworks a where a.created_by = p.id)   as artwork_count
    from public.profiles p
    where q is null
       or p.email ilike '%' || q || '%'
       or p.full_name ilike '%' || q || '%'
    order by p.created_at desc
    limit  greatest(1, least(coalesce(page_limit, 30), 100))
    offset greatest(0, coalesce(page_offset, 0))
  ) t;

  return json_build_object('rows', rows, 'total', total);
end;
$$;

-- Promote / demote. Self-demotion is blocked so an admin can't lock everyone
-- out of the dashboard by accident.
create or replace function public.admin_set_user_role(
  target_id uuid,
  new_role  text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();

  if new_role not in ('user', 'admin') then
    raise exception 'Unknown role: %', new_role using errcode = '22023';
  end if;

  if target_id = auth.uid() and new_role <> 'admin' then
    raise exception 'You cannot remove your own admin access.' using errcode = '22023';
  end if;

  update public.profiles
     set role = new_role, updated_at = now()
   where id = target_id;

  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
end;
$$;

-- Suspend / reinstate. A suspended user keeps their account and can still
-- browse and buy, but the content policies in section 6 stop them posting.
create or replace function public.admin_set_user_suspended(
  target_id uuid,
  suspended boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();

  if target_id = auth.uid() then
    raise exception 'You cannot suspend yourself.' using errcode = '22023';
  end if;

  update public.profiles
     set suspended_at = case when suspended then now() else null end,
         updated_at   = now()
   where id = target_id;

  if not found then
    raise exception 'No such user.' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.admin_list_users(text, int, int)   to authenticated;
grant execute on function public.admin_set_user_role(uuid, text)     to authenticated;
grant execute on function public.admin_set_user_suspended(uuid, boolean) to authenticated;

-- ===========================================================================
-- 4. ARTWORK MANAGEMENT
--    "Admins update artworks" already exists (migrations-roadmap.sql); this
--    adds takedown rights for infringing / broken uploads.
-- ===========================================================================

drop policy if exists "Admins delete artworks" on public.artworks;
create policy "Admins delete artworks"
  on public.artworks for delete
  to authenticated
  using (public.is_admin());

-- Title / hidden / featured search from the dashboard hits these.
create index if not exists artworks_title_idx on public.artworks (lower(title));
create index if not exists artworks_hidden_idx on public.artworks (hidden) where hidden;

-- ===========================================================================
-- 5. CANVAS ORDER MANAGEMENT
--    Reads are already covered by "Admins read canvas orders". Admins also
--    need to move an order along by hand (mark shipped, add tracking, cancel)
--    when Printful's webhook can't.
-- ===========================================================================

drop policy if exists "Admins update canvas orders" on public.canvas_orders;
create policy "Admins update canvas orders"
  on public.canvas_orders for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists canvas_orders_status_idx
  on public.canvas_orders (status, created_at desc);

-- Buyer email for the orders table. Security definer so it can read profiles
-- and orders across users; returns only what the dashboard renders.
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

-- ===========================================================================
-- 6. SUSPENSION ENFORCEMENT
--    Recreated versions of the existing write policies, plus `not
--    is_suspended()`. Reads are untouched — a suspended user sees everything.
-- ===========================================================================

drop policy if exists "Users can post their own comments" on public.comments;
create policy "Users can post their own comments"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_suspended());

drop policy if exists "Users add their own tags" on public.artwork_tags;
create policy "Users add their own tags"
  on public.artwork_tags for insert
  to authenticated
  with check (auth.uid() = user_id and not public.is_suspended());

drop policy if exists "Users manage artworks they created" on public.artworks;
create policy "Users manage artworks they created"
  on public.artworks for all
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by and not public.is_suspended());

-- Admins can take down any comment (a suspension usually follows one).
drop policy if exists "Admins delete comments" on public.comments;
create policy "Admins delete comments"
  on public.comments for delete
  to authenticated
  using (public.is_admin());

-- ===========================================================================
-- 7. ARTWORK TAKEDOWN CLEANUP
-- ---------------------------------------------------------------------------
-- `collections`, `seen`, `comments` and `artwork_tags` all hold `artwork_id` as
-- LOOSE TEXT, not a foreign key — deliberately, because the app also saves and
-- discusses museum works that were never rows in `artworks` (see the header of
-- schema.sql). That means Postgres won't cascade a delete for us, so an admin
-- takedown would otherwise leave those rows behind forever: saved items that
-- render as blanks, comment threads on a work nobody can open, tag counts that
-- never drop.
--
-- `canvas_orders` is INTENTIONALLY NOT touched. Orders are financial records —
-- a buyer's history, a Stripe PaymentIntent and a Printful shipment outlive the
-- catalog row. The orders dashboard already falls back to the raw artwork_id
-- when the title is gone.
-- ===========================================================================

create or replace function public.cleanup_artwork_refs()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  removed integer := 0;
  n       integer;
begin
  -- Each collections row fires sync_artwork_counts(), whose UPDATE matches
  -- nothing now that the artwork row is already gone. Harmless — just noted so
  -- the wasted no-op updates on a heavily-liked work aren't a surprise.
  delete from public.collections where artwork_id = old.id;
  get diagnostics n = row_count; removed := removed + n;

  delete from public.seen where artwork_id = old.id;
  get diagnostics n = row_count; removed := removed + n;

  delete from public.comments where artwork_id = old.id;
  get diagnostics n = row_count; removed := removed + n;

  delete from public.artwork_tags where artwork_id = old.id;
  get diagnostics n = row_count; removed := removed + n;

  if removed > 0 then
    raise notice 'Artwork % deleted — removed % dependent row(s).', old.id, removed;
  end if;

  return old;
end;
$$;

drop trigger if exists artworks_cleanup_refs on public.artworks;
create trigger artworks_cleanup_refs
  after delete on public.artworks
  for each row execute function public.cleanup_artwork_refs();

-- ===========================================================================
-- 8. DASHBOARD OVERVIEW COUNTS
-- ===========================================================================

create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer set search_path = public
as $$
declare
  paid_states text[] := array['paid', 'submitted', 'shipped', 'completed'];
begin
  perform public.require_admin();

  return json_build_object(
    'users',      (select count(*) from public.profiles),
    'admins',     (select count(*) from public.profiles where role = 'admin'),
    'suspended',  (select count(*) from public.profiles where suspended_at is not null),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'artworks',   (select count(*) from public.artworks),
    'hidden',     (select count(*) from public.artworks where hidden),
    'featured',   (select count(*) from public.artworks where featured),
    'for_sale',   (select count(*) from public.artworks where for_sale),
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

-- ===========================================================================
-- Seed the first admin — replace the email, then run this line on its own.
-- (After this migration, role can ONLY be changed here or via
--  admin_set_user_role() called by an existing admin.)
-- ===========================================================================
-- update public.profiles set role = 'admin' where email = 'you@example.com';
