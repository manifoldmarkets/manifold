-- Public per-sport Results. On populated databases, prebuild this index with
-- CREATE INDEX CONCURRENTLY outside a transaction. Verify its definition and
-- pg_index.indisready/indisvalid before running this transaction-safe migration.
-- A canceled concurrent build may leave an invalid index requiring removal and retry.
create index if not exists contracts_official_sports_results_source_time_idx on public.contracts (
  (
    case
      when starts_with(data ->> 'sportsEventId', 'fd-') then 'football-data'
      when starts_with(data ->> 'sportsEventId', 'bdl-f1:') then 'bdl:f1'
      when starts_with(data ->> 'sportsEventId', 'bdl:ncaab-bracket:') then 'bdl:ncaab'
      else split_part(data ->> 'sportsEventId', ':', 1) || ':' || split_part(data ->> 'sportsEventId', ':', 2)
    end
  ),
  resolution_time desc,
  id collate "C" desc
)
where
  creator_id = any (
    array[
      'NnVY8olowYMYQGr346dfmHXBSpx2',
      't3R3HV2QFTRGnJxtxhzdesA4stw1'
    ]
  )
  and visibility = 'public'
  and token = 'MANA'
  and deleted is not true
  and resolution is not null
  and resolution_time is not null
  and outcome_type = 'MULTIPLE_CHOICE'
  and coalesce(data ->> 'sportsMarketType', 'moneyline') in ('moneyline', 'winner');
