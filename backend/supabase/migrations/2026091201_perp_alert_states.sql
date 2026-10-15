begin;

-- Durable milestone/rate-limit state, private to the notification worker.
-- Do not derive deduplication from user_notifications: those are pruned.
create table if not exists public.perp_alert_states (
  user_id text primary key references public.users(id) on delete cascade,
  data jsonb not null default '{"positions":{},"pnlAlertTimes":[]}'::jsonb
);
alter table public.perp_alert_states enable row level security;
-- No client policies: only the backend's privileged DB connection may access.
revoke all on public.perp_alert_states from anon, authenticated;

commit;
