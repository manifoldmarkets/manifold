-- Daily Sports / Midterms / Perps page funnels, written by the update-stats
-- job (backend/shared/src/surface-funnel-analytics.ts). One row per LA day;
-- `funnels` is keyed by surface, see SurfaceFunnels in
-- common/src/stat-surfaces.ts.
--
-- These are internal product metrics, so they stay out of daily_stats, which
-- anyone can read and /stats embeds in its public HTML. Only the backend
-- reads this table; admins see it through the get-surface-funnels endpoint.
-- Run before deploying the scheduler, which writes it.
create table if not exists
  public.daily_surface_funnels (
    start_date date primary key,
    funnels jsonb not null,
    updated_time timestamptz not null default now()
  );

alter table public.daily_surface_funnels enable row level security;

revoke all on public.daily_surface_funnels
from
  anon,
  authenticated;
