-- On a populated database, prebuild the canonical index with CREATE INDEX
-- CONCURRENTLY outside a transaction. An interrupted build can leave an
-- invalid index. Inspect its definition and active build before removing it.
-- The verified prebuild path reads only catalogs. Even CREATE INDEX IF NOT
-- EXISTS would request a write-blocking SHARE lock before checking the name.
do $migration$
declare
  found_index oid := pg_catalog.to_regclass('public.contracts_official_sports_results_source_time_idx');
  -- PostgreSQL's deparsed definition doubles as the only fresh-install DDL.
  -- Comparing the whole definition also checks opclasses, collation, order,
  -- predicate, uniqueness and included columns.
  expected constant text := $index$CREATE INDEX contracts_official_sports_results_source_time_idx
ON public.contracts USING btree ((
CASE
    WHEN starts_with((data ->> 'sportsEventId'::text), 'fd-'::text) THEN 'football-data'::text
    WHEN starts_with((data ->> 'sportsEventId'::text), 'bdl-f1:'::text) THEN 'bdl:f1'::text
    WHEN starts_with((data ->> 'sportsEventId'::text), 'bdl:ncaab-bracket:'::text) THEN 'bdl:ncaab'::text
    ELSE ((split_part((data ->> 'sportsEventId'::text), ':'::text, 1) || ':'::text) || split_part((data ->> 'sportsEventId'::text), ':'::text, 2))
END), resolution_time DESC, id COLLATE "C" DESC)
WHERE ((creator_id = ANY (ARRAY['NnVY8olowYMYQGr346dfmHXBSpx2'::text, 't3R3HV2QFTRGnJxtxhzdesA4stw1'::text]))
  AND (visibility = 'public'::text)
  AND (token = 'MANA'::text)
  AND (deleted IS NOT TRUE)
  AND (resolution IS NOT NULL)
  AND (resolution_time IS NOT NULL)
  AND (outcome_type = 'MULTIPLE_CHOICE'::text)
  AND (COALESCE((data ->> 'sportsMarketType'::text), 'moneyline'::text) = ANY (ARRAY['moneyline'::text, 'winner'::text])))$index$;
begin
  if found_index is null then
    execute expected;
  elsif not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = found_index
      and i.indrelid = 'public.contracts'::regclass
      and i.indisready
      and i.indisvalid
      and i.indislive
      and pg_catalog.regexp_replace(pg_catalog.pg_get_indexdef(i.indexrelid), '[[:space:]]+', ' ', 'g')
        = pg_catalog.regexp_replace(expected, '[[:space:]]+', ' ', 'g')
  ) then
    raise exception 'Results index name exists with an unexpected definition, target or build state'
      using hint = 'Inspect public.contracts_official_sports_results_source_time_idx and pg_stat_progress_create_index before retrying.';
  end if;
end
$migration$;
