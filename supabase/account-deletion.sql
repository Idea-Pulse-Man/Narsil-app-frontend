-- ===========================================================================
-- Narsil — in-app account deletion
-- Safe to re-run. Run in the Supabase SQL Editor after canvas-checkout.sql.
--
-- Apple requires that anyone who can create an account can also delete it
-- from inside the app. The backend (POST /api/me/delete →
-- services/accountDeletion.ts) deletes the auth user; nearly every personal
-- table already follows with `on delete cascade`.
--
-- Canvas orders must NOT disappear with the person: they are financial
-- records, and Printful may still be shipping one. This makes the order's
-- owner nullable and switches the foreign key to `on delete set null`, so a
-- deleted account leaves anonymous order rows behind. The backend refuses to
-- delete anything until this has run.
-- ===========================================================================

alter table public.canvas_orders alter column user_id drop not null;

alter table public.canvas_orders
  drop constraint if exists canvas_orders_user_id_fkey;

alter table public.canvas_orders
  add constraint canvas_orders_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;
