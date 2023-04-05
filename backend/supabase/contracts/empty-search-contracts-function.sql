CREATE OR REPLACE FUNCTION empty_search_contracts(
    contract_filter TEXT,
    contract_sort TEXT,
    offset_n INTEGER,
    limit_n INTEGER,
    group_id TEXT DEFAULT NULL,
    creator_id TEXT DEFAULT NULL
  ) RETURNS TABLE (data jsonb) AS $$
DECLARE base_query TEXT;
where_clause TEXT;
sql_query TEXT;
BEGIN -- Common WHERE clause
-- If fuzzy search is enabled and is group search
IF group_id is not null then base_query := FORMAT(
  '
SELECT contractz.data
FROM (select contracts_rbac.*, group_contracts.group_id from contracts_rbac join group_contracts on group_contracts.contract_id = contracts_rbac.id) as contractz,
      %s
AND contractz.group_id = %L',
  generate_where_query(contract_filter, contract_sort, creator_id),
  group_id
);
-- If full text search is enabled
ELSE base_query := FORMAT(
  '
  SELECT contracts_rbac.data
  FROM contracts_rbac 
    %s',
  generate_where_query(contract_filter, contract_sort, creator_id)
);
END IF;
sql_query := FORMAT(
  ' %s %s ',
  base_query,
  generate_empty_sort_query(contract_sort, offset_n, limit_n)
);
RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
-- generates latter half of search query
CREATE OR REPLACE FUNCTION generate_empty_sort_query(
    contract_sort TEXT,
    offset_n INTEGER,
    limit_n INTEGER
  ) RETURNS TEXT AS $$
DECLARE sql_query TEXT;
BEGIN sql_query := FORMAT(
  '
  ORDER BY CASE
      %L
      WHEN '' relevance '' THEN popularity_score
    END DESC NULLS LAST,
    CASE
      %L
      WHEN '' score '' THEN popularity_score
      WHEN '' daily - score '' THEN (data->>'' dailyScore '')::numeric
      WHEN '' 24 - hour - vol '' THEN (data->>'' volume24Hours '')::numeric
      WHEN '' liquidity '' THEN (data->>'' elasticity '')::numeric
      WHEN '' last - updated '' THEN (data->>'' lastUpdatedTime '')::numeric
    END DESC NULLS LAST,
    CASE
      %L
      WHEN '' most - popular '' THEN (data->>'' uniqueBettorCount '')::integer
    END DESC NULLS LAST,
    CASE
      %L
      WHEN '' newest '' THEN created_time
      WHEN '' resolve - date '' THEN resolution_time
    END DESC NULLS LAST,
    CASE
      WHEN %L = '' close - date '' THEN close_time
    END ASC NULLS LAST OFFSET %s
  LIMIT %s ',
  contract_sort,
  contract_sort,
  contract_sort,
  contract_sort,
  contract_sort,
  offset_n,
  limit_n
);
RETURN sql_query;
END;
$$ LANGUAGE plpgsql;
-- CREATE OR REPLACE FUNCTION search_contracts_fuzzy(
--     term TEXT,
--     contract_filter TEXT,
--     contract_sort TEXT offset_n INTEGER,
--     limit_n INTEGER
--   ) RETURNS TABLE (data jsonb) AS $$ BEGIN RETURN QUERY
-- SELECT scored_contracts.data
-- FROM (
--     SELECT contracts_rbac.*,
--       similarity(contracts_rbac.question, term) AS similarity_score
--     FROM contracts_rbac
--   ) AS scored_contracts
-- WHERE scored_contracts.similarity_score > 0.1
--   AND (
--     (
--       contract_filter = ' open '
--       AND resolution_time IS NULL
--     )
--     OR (
--       contract_filter = ' closed '
--       AND close_time < NOW()
--       and resolution_time IS NULL
--     )
--     OR (
--       contract_filter = ' resolved '
--       AND resolution_time IS NOT NULL
--     )
--     OR (contract_filter = ' all ')
--   )
--   AND (
--     contract_sort != ' close - date '
--     OR (
--       contract_sort = ' close - date '
--       AND close_time > NOW()
--     )
--   )
-- ORDER BY CASE
--     contract_sort
--     WHEN ' relevance ' THEN similarity_score
--     WHEN ' score ' THEN popularity_score
--     WHEN ' daily - score ' THEN (scored_contracts.data->>' dailyScore ')::numeric
--     WHEN ' 24 - hour - vol ' THEN (scored_contracts.data->>' volume24Hours ')::numeric
--     WHEN ' liquidity ' THEN (scored_contracts.data->>' elasticity ')::numeric
--     WHEN ' last - updated ' THEN (scored_contracts.data->>' lastUpdatedTime ')::numeric
--   END DESC NULLS LAST,
--   CASE
--     contract_sort
--     WHEN ' most - popular ' THEN (scored_contracts.data->>' uniqueBettorCount ')::integer
--   END DESC NULLS LAST,
--   CASE
--     contract_sort
--     WHEN ' newest ' THEN created_time
--     WHEN ' resolve - date ' THEN resolution_time
--   END DESC NULLS LAST,
--   CASE
--     WHEN contract_sort = ' close - date ' THEN close_time
--   END ASC NULLS LAST OFFSET offset_n
-- LIMIT limit_n;
-- END;
-- $$ LANGUAGE plpgsql;