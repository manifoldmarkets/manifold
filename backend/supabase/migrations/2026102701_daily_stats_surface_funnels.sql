-- Daily Sports / Midterms / Perps page funnels for /stats, written by the
-- update-stats job (backend/shared/src/surface-funnel-analytics.ts). One
-- object per day keyed by surface; see SurfaceFunnels in
-- common/src/stat-surfaces.ts for the shape.
--
-- Additive and nullable: existing rows and readers are unaffected, and days
-- the job has not reached stay null. Run before deploying the scheduler, whose
-- upserts name this column.
alter table daily_stats
  add column if not exists surface_funnels jsonb;
