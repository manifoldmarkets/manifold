-- Partial index for the expire-limit-orders cron (runs every 5 minutes):
--
--   update contract_bets set data = data || '{"isCancelled": true}'
--   where is_filled = false and is_cancelled = false and expires_at < now()
--
-- No existing index covers this predicate (contract_bets_user_outstanding_limit_orders
-- leads with user_id), so each run reads a large share of contract_bets from disk
-- (9-25s mean, 600s+ worst case in pg_stat_statements) and holds row locks on
-- unfilled limit orders for its whole runtime. The index narrows each run to just
-- the open orders that actually have an expiry, making it a sub-ms lookup.
--
-- On prod create it CONCURRENTLY by hand to avoid locking the live table:
--
--   create index concurrently if not exists contract_bets_expiring_limit_orders
--     on contract_bets (expires_at)
--     where is_filled = false and is_cancelled = false and expires_at is not null;
--
-- This file uses the plain (transaction-safe) form for fresh / CI databases,
-- where the table is small so a brief lock is fine. IF NOT EXISTS makes it a
-- no-op wherever the index already exists (incl. prod).
create index if not exists contract_bets_expiring_limit_orders
  on contract_bets (expires_at)
  where is_filled = false and is_cancelled = false and expires_at is not null;
