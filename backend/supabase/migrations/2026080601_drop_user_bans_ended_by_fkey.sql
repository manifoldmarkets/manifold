-- The unban-users scheduler job sets ended_by = 'system' when a temp ban
-- expires, but user_bans_ended_by_fkey (ended_by references users(id)) rejects
-- that sentinel, so the job has crashed on every hourly run since the first
-- temp ban expired (2026-01-17). The web UI (ban-modal.tsx) already renders
-- ended_by = 'system' as "System (auto-expired)", so the sentinel is the
-- intended design; the FK is the bug. created_by and user_id keep their FKs.
alter table user_bans
drop constraint if exists user_bans_ended_by_fkey;

-- Close out the bans left stuck by the crash. Same statement the job runs;
-- idempotent, and enforcement reads already exclude rows with end_time in the
-- past, so this only fixes bookkeeping.
update user_bans
set ended_by = 'system', ended_at = now()
where ended_at is null
  and end_time is not null
  and end_time <= now();
