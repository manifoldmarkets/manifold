-- Expression index on contracts ((data->>'sportsLeague')), partial to the rows
-- that have it (i.e. only Manifold Sports markets). Powers the sports-markets
-- read endpoint, the live-poll active-window gate, and the resolver's
-- unresolved-markets scan — all of which filter on data->>'sportsLeague'.
-- Without it, each runs a sequential scan over the entire contracts table
-- (~4s on prod), and the 10s sports-live cron makes that constant.
--
-- On prod this was created CONCURRENTLY by hand to avoid locking the live table:
--
--   create index concurrently if not exists contracts_sports_league_idx
--     on contracts ((data->>'sportsLeague'))
--     where data->>'sportsLeague' is not null;
--
-- This file uses the plain (transaction-safe) form for fresh / CI databases,
-- where the contracts table is small so a brief lock is fine. IF NOT EXISTS
-- makes it a no-op wherever the index already exists (incl. prod).
create index if not exists contracts_sports_league_idx
  on contracts ((data->>'sportsLeague'))
  where data->>'sportsLeague' is not null;
