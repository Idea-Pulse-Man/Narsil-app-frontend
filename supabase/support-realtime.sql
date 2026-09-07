-- Enable Realtime for live chat (member ↔ admin).
-- REQUIRED: run in Supabase SQL Editor once (safe to re-run).
--
-- Without this, websockets won't push new rows. The app also polls every ~1.5s
-- as a fallback, but Realtime is still preferred.
--
-- Check: Dashboard → Database → Publications → supabase_realtime
--        should list public.support_messages.

alter table public.support_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication missing — enable Realtime in the project settings.';
end $$;

notify pgrst, 'reload schema';
