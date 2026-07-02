-- Partial index for fetching a market's open limit-order book:
--
--   select contract_bets.* from contract_bets
--   where contract_id = $1
--     and is_filled = false and is_cancelled = false
--   order by created_time desc
--   limit $2
--
-- (public API /v0/bets?contractId=…&kinds=open-limit, built in
-- shared/supabase/bets.ts getBetsWithFilter)
--
-- contract_bets_contract_limit_orders (contract_id, is_filled, is_cancelled,
-- is_redemption, created_time desc) covers the predicate, but the planner
-- often prefers walking contract_bets_created_time (contract_id, created_time
-- desc) because it is pre-sorted for the ORDER BY … LIMIT. That walk only
-- terminates early once it has found `limit` matching rows — so on a
-- high-volume market with FEWER open limits than the requested limit it scans
-- the contract's entire bet history and hits the statement timeout.
-- Measured on prod (2026-07-02): limit=10 → 0.18s (early stop works),
-- limit=1000 on a market with 725 open limits → 60s, HTTP 500 (pg 57014).
--
-- This partial index is both pre-filtered AND pre-sorted, so it dominates the
-- created_time walk at every limit value and leaves the planner no wrong
-- choice. Same pattern as contract_bets_expiring_limit_orders (2026061101).
--
-- On prod create it CONCURRENTLY by hand to avoid locking the live table:
--
--   create index concurrently if not exists contract_bets_contract_open_limit_orders
--     on contract_bets (contract_id, created_time desc)
--     where is_filled = false and is_cancelled = false;
--
-- This file uses the plain (transaction-safe) form for fresh / CI databases,
-- where the table is small so a brief lock is fine. IF NOT EXISTS makes it a
-- no-op wherever the index already exists (incl. prod).
create index if not exists contract_bets_contract_open_limit_orders
  on contract_bets (contract_id, created_time desc)
  where is_filled = false
  and is_cancelled = false;
