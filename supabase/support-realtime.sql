-- Enable Realtime for live chat (member ↔ admin).
-- Safe to re-run: ignores if the table is already in the publication.
do $$
begin
  alter publication supabase_realtime add table public.support_messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication missing — enable Realtime in the dashboard.';
end $$;
