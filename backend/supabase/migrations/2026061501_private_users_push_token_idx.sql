-- Expression index on private_users ((data->>'pushToken')), partial to the rows
-- that have a token. set-push-token now reclaims a device token from any other
-- account that holds it:
--
--   update private_users set data = data - 'pushToken'
--   where id <> $1 and data->>'pushToken' = $2
--
-- That predicate filters on data->>'pushToken', which was previously unindexed,
-- so the reclaim was a sequential scan over all of private_users (~194k rows /
-- ~530 MB on prod) on every app launch (set-push-token runs on each launch).
-- The index turns it into a sub-ms lookup.
--
-- On prod create it CONCURRENTLY by hand to avoid locking the live table:
--
--   create index concurrently if not exists private_users_push_token_idx
--     on private_users ((data->>'pushToken'))
--     where data->>'pushToken' is not null;
--
-- This file uses the plain (transaction-safe) form for fresh / CI databases,
-- where the table is small so a brief lock is fine. IF NOT EXISTS makes it a
-- no-op wherever the index already exists (incl. prod).
create index if not exists private_users_push_token_idx
  on private_users ((data->>'pushToken'))
  where data->>'pushToken' is not null;
