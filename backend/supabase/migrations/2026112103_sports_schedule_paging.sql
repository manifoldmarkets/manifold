-- For a populated database, run each CREATE INDEX with CONCURRENTLY after
-- INDEX as a separate autocommit statement before applying this migration.
-- Verify the definitions and indisready/indisvalid in pg_index. If an aborted
-- build left the named index invalid, DROP INDEX CONCURRENTLY outside a transaction
-- before retrying. Fresh databases can apply both statements in a transaction.
create index if not exists contracts_sports_schedule_idx on public.contracts (close_time, id)
where
  data ->> 'sportsEventId' is not null
  and visibility = 'public'
  and token = 'MANA'
  and coalesce(deleted, false) = false
  and resolution is distinct from 'CANCEL';

create index if not exists contracts_sports_resumption_idx on public.contracts ((data -> 'sportsResumptionTime'), id)
where
  resolution is null
  and jsonb_typeof(data -> 'sportsResumptionTime') = 'number'
  and upper(data ->> 'sportsLiveStatus') in ('SUSPENDED', 'POSTPONED');
