-- Apply after 2026112103_sports_schedule_paging.sql. On a populated database,
-- prebuild this index with CREATE INDEX CONCURRENTLY outside a transaction.
-- Verify pg_index.indisready, indisvalid and pg_get_indexdef. If an interrupted
-- build leaves an invalid index, DROP INDEX CONCURRENTLY before retrying.
create index if not exists contracts_sports_live_receipt_idx on public.contracts ((data -> 'sportsLiveUpdatedTime'), id)
where
  resolution is null
  and jsonb_typeof(data -> 'sportsLiveUpdatedTime') = 'number'
  and upper(data ->> 'sportsLiveStatus') in ('IN_PROGRESS', 'IN_PLAY', 'PAUSED');
