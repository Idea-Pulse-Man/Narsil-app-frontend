-- ===========================================================================
-- Narsil — iPhone push notification tokens
-- Safe to re-run. Run in the Supabase SQL Editor after schema.sql.
--
-- One row per device that allowed notifications. The app registers its APNs
-- token through register_push_token() (a device that signs into another
-- account moves to that account); the backend reads tokens with the service
-- role and deletes ones Apple reports as dead. Rows go when the account does.
-- ===========================================================================

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null default 'ios',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create or replace function public.register_push_token(p_token text, p_platform text default 'ios')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_token is null or length(p_token) < 32 or length(p_token) > 400 then
    raise exception 'Invalid push token';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), coalesce(nullif(p_platform, ''), 'ios'), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
