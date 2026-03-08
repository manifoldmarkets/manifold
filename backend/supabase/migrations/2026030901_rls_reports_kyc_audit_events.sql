-- Enable/tighten RLS on reports, kyc_bonus_rewards, and audit_events
-- Backend uses createSupabaseDirectClient() which bypasses RLS
-- These changes only affect frontend Supabase anon-key access

-- 1. reports: currently has NO RLS at all
alter table reports enable row level security;

-- Authenticated users can read (frontend admin page gates on useAdmin/useAdminOrMod)
create policy "authenticated read" on reports for select
  using (firebase_uid() is not null);

-- Users can only insert reports as themselves
create policy "own insert" on reports for insert
  with check (firebase_uid() = user_id);

-- No update/delete policies — backend handles dismissals via direct client

-- 2. kyc_bonus_rewards: has overly permissive public read, restrict to own user
drop policy if exists "public read" on kyc_bonus_rewards;

create policy "own read" on kyc_bonus_rewards for select
  using (firebase_uid() = user_id);

-- 3. audit_events: has public read, no frontend usage — lock it down
-- RLS enabled + no policies = deny all for anon key, backend still has full access
drop policy if exists "public read" on audit_events;
