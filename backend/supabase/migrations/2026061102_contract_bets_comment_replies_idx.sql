-- Partial index for the commentRepliesOnly filter in getBetsWithFilter
-- (shared/src/supabase/bets.ts), used by the market page comments section:
--
--   ... where contract_id = $1
--     and contract_bets.data->>'replyToCommentId' is not null
--   order by contract_bets.created_time desc limit $n
--
-- Reply-bets are a tiny fraction of contract_bets, but no index covers the
-- JSONB filter, so each call walks the contract's bets via
-- (contract_id, created_time) checking the heap row by row — 570-840ms mean
-- at ~55% cache hit, ~8% of total db time in pg_stat_statements. This index
-- narrows it to just the reply-bets.
--
-- On prod create it CONCURRENTLY by hand to avoid locking the live table:
--
--   create index concurrently if not exists contract_bets_comment_replies
--     on contract_bets (contract_id, created_time desc)
--     where data->>'replyToCommentId' is not null;
--
-- This file uses the plain (transaction-safe) form for fresh / CI databases,
-- where the table is small so a brief lock is fine. IF NOT EXISTS makes it a
-- no-op wherever the index already exists (incl. prod).
create index if not exists contract_bets_comment_replies
  on contract_bets (contract_id, created_time desc)
  where data->>'replyToCommentId' is not null;
