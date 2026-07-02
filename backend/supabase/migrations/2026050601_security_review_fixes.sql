-- Supabase security review fixes (2026-05-06)
--
-- 1. SECURITY DEFINER views: Postgres views default to executing with the
--    view owner's permissions (security_invoker = off), which Supabase's
--    linter flags. Drop the unused ones; switch the rest to security_invoker
--    so they run with the querying user's permissions.
--
-- 2. RLS disabled on public tables: backend uses createSupabaseDirectClient()
--    which bypasses RLS, so we just need to enable RLS and add minimal
--    policies for any anon-key reads.

-- Drop unused views
-- final_pp_balances: only referenced in a code comment in
--   convert-remaining-prize-points.ts (legacy PrizePoint conversion).
-- group_role: not queried anywhere in the codebase.
drop view if exists public.final_pp_balances;
drop view if exists public.group_role;

-- Make remaining views run with the querying user's permissions.
-- Backing tables already have public-read RLS so existing anon-key callers
-- (web/lib/supabase/leagues.ts, common/supabase/referrals.ts) keep working,
-- and the dependent materialized view mv_ach_referrals is preserved.
alter view public.user_referrals_profit set (security_invoker = on);
alter view public.user_league_info set (security_invoker = on);

-- stonk_images: not referenced in code; backend (if it ever reads this) uses
-- the direct client which bypasses RLS, so no policies needed.
alter table public.stonk_images enable row level security;

-- dashboard_follows: web reads only the current user's own follow status via
-- getUserFollowsDashboard; writes go through the backend's direct DB client
-- which bypasses RLS.
alter table public.dashboard_follows enable row level security;

create policy "own read" on public.dashboard_follows for select
  using (firebase_uid() = follower_id);
