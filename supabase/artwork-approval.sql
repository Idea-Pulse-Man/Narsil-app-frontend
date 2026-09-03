-- ===========================================================================
-- Narsil — User-upload approval (moderation queue)
-- ---------------------------------------------------------------------------
-- Member posts (artworks.created_by set) start as pending + hidden and stay
-- out of the public catalog until an admin approves them. Rejected works stay
-- hidden for the record (or can still be deleted from the dashboard).
--
-- Museum / ingest rows keep approval_status = 'approved' (the column default).
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste this file → Run.
--   Requires: schema.sql → catalog-columns.sql → migrations-roadmap.sql
--             → admin-dashboard.sql
--   Safe to re-run.
-- ===========================================================================

-- ── Column ──────────────────────────────────────────────────────────────────

alter table public.artworks
  add column if not exists approval_status text not null default 'approved'
  constraint artworks_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected'));

comment on column public.artworks.approval_status is
  'pending = awaiting admin review (user upload); approved = live; rejected = kept hidden.';

create index if not exists artworks_approval_pending_idx
  on public.artworks (created_at desc)
  where approval_status = 'pending';

-- Existing catalog rows keep approval_status = 'approved' (column default).
-- Only NEW member uploads enter the queue via the trigger below.

-- ── Triggers: force pending on member insert; lock moderation columns ───────

create or replace function public.artworks_enforce_approval()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Member self-uploads always enter the queue. Service-role / admin ingest
    -- (auth.uid() null or is_admin) keeps the supplied / default status.
    if new.created_by is not null
       and auth.uid() is not null
       and new.created_by = auth.uid()
       and not public.is_admin() then
      new.approval_status := 'pending';
      new.hidden := true;
    end if;
    return new;
  end if;

  -- UPDATE: only admins may change moderation / visibility flags.
  if not public.is_admin() then
    if new.approval_status is distinct from old.approval_status
       or new.hidden is distinct from old.hidden
       or new.featured is distinct from old.featured then
      raise exception 'Only admins can change artwork approval or visibility.'
        using errcode = '42501';
    end if;
  end if;

  -- Pending / rejected never appear in the public catalog.
  if new.approval_status in ('pending', 'rejected') then
    new.hidden := true;
  end if;

  return new;
end;
$$;

drop trigger if exists artworks_enforce_approval on public.artworks;
create trigger artworks_enforce_approval
  before insert or update on public.artworks
  for each row execute function public.artworks_enforce_approval();

-- ── Overview: pending count for the admin dashboard ─────────────────────────

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
    'pending_approvals', (
      select count(*) from public.artworks where approval_status = 'pending'
    ),
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
