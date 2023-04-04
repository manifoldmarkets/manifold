-- CREATE OR REPLACE FUNCTION search_contracts(
--   term TEXT,
--   contract_filter TEXT,
--   contract_sort TEXT,
--   offset_n INTEGER,
--   limit_n INTEGER
-- ) RETURNS TABLE (
--   data jsonb
-- ) AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT contracts_rbac.data
--   FROM contracts_rbac, websearch_to_tsquery('english', term) query
--   WHERE contracts_rbac.question_fts @@ query 
--     AND (
--     (contract_filter = 'open' AND contracts_rbac.resolution_time IS NULL)
--     OR (contract_filter = 'closed' AND contracts_rbac.close_time <  NOW() and contracts_rbac.resolution_time IS NULL)
--     OR (contract_filter = 'resolved' AND contracts_rbac.resolution_time IS NOT NULL)
--     OR (contract_filter = 'all')
--   )
--   AND (contract_sort != 'close-date' OR (contract_sort = 'close-date' AND contracts_rbac.close_time > NOW()))
-- ORDER BY
--   CASE contract_sort
--     WHEN 'relevance' THEN ts_rank_cd(contracts_rbac.question_fts, query)
--     END DESC NULLS LAST,
--   CASE contract_sort
--     WHEN 'score' THEN contracts_rbac.popularity_score
--     WHEN 'daily-score' THEN (contracts_rbac.data->>'dailyScore')::numeric
--     WHEN '24-hour-vol' THEN (contracts_rbac.data->>'volume24Hours')::numeric
--     WHEN 'liquidity' THEN (contracts_rbac.data->>'elasticity')::numeric
--     WHEN 'last-updated' THEN (contracts_rbac.data->>'lastUpdatedTime')::numeric
--     END DESC NULLS LAST,
--   CASE contract_sort
--     WHEN 'most-popular' THEN (contracts_rbac.data->>'uniqueBettorCount')::integer
--     END DESC NULLS LAST,
--   CASE contract_sort
--     WHEN 'newest' THEN contracts_rbac.created_time
--     WHEN 'resolve-date' THEN contracts_rbac.resolution_time
--   END DESC NULLS LAST,
--   CASE WHEN contract_sort = 'close-date' THEN contracts_rbac.close_time END ASC NULLS LAST
--   OFFSET offset_n
--   LIMIT limit_n
--   ;
-- END;
-- $$ LANGUAGE plpgsql;
-- DEF WORKS
-- CREATE OR REPLACE FUNCTION search_contracts(
--     term TEXT,
--     contract_filter TEXT,
--     contract_sort TEXT,
--     offset_n INTEGER,
--     limit_n INTEGER,
--     fuzzy BOOLEAN DEFAULT false,
--     groupId TEXT DEFAULT NULL
--   ) RETURNS TABLE (data jsonb) AS $$
-- DECLARE base_query TEXT;
-- where_clause TEXT;
-- sql_query TEXT;
-- BEGIN -- Common WHERE clause
-- where_clause := FORMAT(
--   'WHERE (
--     (%L = ''open'' AND resolution_time IS NULL)
--     OR (%L = ''closed'' AND close_time < NOW() AND resolution_time IS NULL)
--     OR (%L = ''resolved'' AND resolution_time IS NOT NULL)
--     OR (%L = ''all'')
--   )
--   AND (%L != ''close-date'' OR (%L = ''close-date'' AND close_time > NOW()))',
--   contract_filter,
--   contract_filter,
--   contract_filter,
--   contract_filter,
--   contract_sort,
--   contract_sort
-- );
-- -- If fuzzy search is enabled
-- IF fuzzy THEN base_query := FORMAT(
--   '
--       SELECT scored_contracts.data
--       FROM (
--         SELECT contracts_rbac.*,
--                similarity(contracts_rbac.question, %L) AS similarity_score
--         FROM contracts_rbac
--       ) AS scored_contracts
--       %s
--       AND scored_contracts.similarity_score > 0.1',
--   term,
--   where_clause
-- );
-- ELSE base_query := FORMAT(
--   '
--       SELECT contracts_rbac.data
--       FROM contracts_rbac, websearch_to_tsquery(''english'', %L) query
--       %s
--       AND contracts_rbac.question_fts @@ query',
--   term,
--   where_clause
-- );
-- END IF;
-- sql_query := FORMAT(
--   '
--     %s
--     ORDER BY
--       CASE %L
--         WHEN ''relevance'' THEN %s
--         END DESC NULLS LAST,
--       CASE %L
--         WHEN ''score'' THEN popularity_score
--         WHEN ''daily-score'' THEN (data->>''dailyScore'')::numeric
--         WHEN ''24-hour-vol'' THEN (data->>''volume24Hours'')::numeric
--         WHEN ''liquidity'' THEN (data->>''elasticity'')::numeric
--         WHEN ''last-updated'' THEN (data->>''lastUpdatedTime'')::numeric
--         END DESC NULLS LAST,
--       CASE %L
--         WHEN ''most-popular'' THEN (data->>''uniqueBettorCount'')::integer
--         END DESC NULLS LAST,
--       CASE %L
--         WHEN ''newest'' THEN created_time
--         WHEN ''resolve-date'' THEN resolution_time
--         END DESC NULLS LAST,
--       CASE WHEN %L = ''close-date'' THEN close_time END ASC NULLS LAST
--     OFFSET %L
--     LIMIT %L',
--   base_query,
--   contract_sort,
--   CASE
--     WHEN fuzzy THEN 'similarity_score'
--     ELSE 'ts_rank_cd(question_fts, query)'
--   END,
--   contract_sort,
--   contract_sort,
--   contract_sort,
--   contract_sort,
--   offset_n,
--   limit_n
-- );
-- RETURN QUERY EXECUTE sql_query;
-- END;
-- $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION search_contracts(
    term TEXT,
    contract_filter TEXT,
    contract_sort TEXT,
    offset_n INTEGER,
    limit_n INTEGER,
    fuzzy BOOLEAN DEFAULT false,
    groupId TEXT DEFAULT NULL
  ) RETURNS TABLE (data jsonb) AS $$
DECLARE base_query TEXT;
where_clause TEXT;
sql_query TEXT;
BEGIN -- Common WHERE clause
-- If fuzzy search is enabled and is group search
IF groupId is not null
and fuzzy then base_query := FORMAT(
  '
      SELECT scored_contracts.data as contract_data
      FROM (
        SELECT contracts_rbac.*,
               similarity(contracts_rbac.question, %L) AS similarity_score
        FROM contracts_rbac
      ) AS scored_contracts join group_contracts on group_contracts.contract_id = scored_contracts.id
      %s
      AND scored_contracts.similarity_score > 0.1
      AND group_contracts.group_id = %L',
  term,
  generate_where_query(contract_filter, contract_sort),
  groupId
);
-- If full text search is enabled and is group search
ELSIF groupId is not null then base_query := FORMAT(
  '
SELECT contracts_rbac.data as contract_data
FROM contracts_rbac join group_contracts on group_contracts.contract_id = scored_contracts.id,
  websearch_to_tsquery('' english '', %L) query
      %s
AND contracts_rbac.question_fts @@ query
AND group_contracts.group_id = %L',
  term,
  generate_where_query(contract_filter, contract_sort),
  groupId
);
-- If fuzzy search is enabled
ELSIF fuzzy THEN base_query := FORMAT(
  '
      SELECT scored_contracts.data as contract_data
      FROM (
        SELECT contracts_rbac.*,
               similarity(contracts_rbac.question, %L) AS similarity_score
        FROM contracts_rbac
      ) AS scored_contracts
      %s
      AND scored_contracts.similarity_score > 0.1',
  term,
  generate_where_query(contract_filter, contract_sort)
);
-- If full text search is enabled
ELSE base_query := FORMAT(
  '
      SELECT contracts_rbac.data as contract_data
      FROM contracts_rbac, websearch_to_tsquery(''english'', %L) query
      %s
      AND contracts_rbac.question_fts @@ query',
  term,
  generate_where_query(contract_filter, contract_sort)
);
END IF;
sql_query := FORMAT(
  '
    %s
    %s',
  base_query,
  generate_sort_query(contract_sort, fuzzy, offset_n, limit_n)
);
RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
-- generates where and filter part of search query
CREATE OR REPLACE FUNCTION generate_where_query(
    contract_filter TEXT,
    contract_sort TEXT
  ) RETURNS TEXT AS $$
DECLARE where_clause TEXT;
BEGIN where_clause := FORMAT(
  'WHERE (
    (%L = ''open'' AND resolution_time IS NULL)
    OR (%L = ''closed'' AND close_time < NOW() AND resolution_time IS NULL)
    OR (%L = ''resolved'' AND resolution_time IS NOT NULL)
    OR (%L = ''all'')
  )
  AND (%L != ''close-date'' OR (%L = ''close-date'' AND close_time > NOW()))',
  contract_filter,
  contract_filter,
  contract_filter,
  contract_filter,
  contract_sort,
  contract_sort
);
RETURN where_clause;
END;
$$ LANGUAGE plpgsql;
-- generates latter half of search query
CREATE OR REPLACE FUNCTION generate_sort_query(
    contract_sort TEXT,
    fuzzy BOOLEAN,
    offset_n INTEGER,
    limit_n INTEGER
  ) RETURNS TEXT AS $$
DECLARE sql_query TEXT;
BEGIN sql_query := FORMAT(
  '
      ORDER BY
        CASE %L
          WHEN ''relevance'' THEN %s
          END DESC NULLS LAST,
        CASE %L
          WHEN ''score'' THEN popularity_score
          WHEN ''daily-score'' THEN (contract_data->>''dailyScore'')::numeric
          WHEN ''24-hour-vol'' THEN (contract_data->>''volume24Hours'')::numeric
          WHEN ''liquidity'' THEN (contract_data->>''elasticity'')::numeric
          WHEN ''last-updated'' THEN (dacontract_data->>''lastUpdatedTime'')::numeric
          END DESC NULLS LAST,
        CASE %L
          WHEN ''most-popular'' THEN (contract_data->>''uniqueBettorCount'')::integer
          END DESC NULLS LAST,
        CASE %L
          WHEN ''newest'' THEN created_time
          WHEN ''resolve-date'' THEN resolution_time
          END DESC NULLS LAST,
        CASE WHEN %L = ''close-date'' THEN close_time END ASC NULLS LAST
      OFFSET %s
      LIMIT %s',
  contract_sort,
  CASE
    WHEN fuzzy THEN 'similarity_score'
    ELSE 'ts_rank_cd(question_fts, query)'
  END,
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
--       contract_filter = 'open'
--       AND resolution_time IS NULL
--     )
--     OR (
--       contract_filter = 'closed'
--       AND close_time < NOW()
--       and resolution_time IS NULL
--     )
--     OR (
--       contract_filter = 'resolved'
--       AND resolution_time IS NOT NULL
--     )
--     OR (contract_filter = 'all')
--   )
--   AND (
--     contract_sort != 'close-date'
--     OR (
--       contract_sort = 'close-date'
--       AND close_time > NOW()
--     )
--   )
-- ORDER BY CASE
--     contract_sort
--     WHEN 'relevance' THEN similarity_score
--     WHEN 'score' THEN popularity_score
--     WHEN 'daily-score' THEN (scored_contracts.data->>'dailyScore')::numeric
--     WHEN '24-hour-vol' THEN (scored_contracts.data->>'volume24Hours')::numeric
--     WHEN 'liquidity' THEN (scored_contracts.data->>'elasticity')::numeric
--     WHEN 'last-updated' THEN (scored_contracts.data->>'lastUpdatedTime')::numeric
--   END DESC NULLS LAST,
--   CASE
--     contract_sort
--     WHEN 'most-popular' THEN (scored_contracts.data->>'uniqueBettorCount')::integer
--   END DESC NULLS LAST,
--   CASE
--     contract_sort
--     WHEN 'newest' THEN created_time
--     WHEN 'resolve-date' THEN resolution_time
--   END DESC NULLS LAST,
--   CASE
--     WHEN contract_sort = 'close-date' THEN close_time
--   END ASC NULLS LAST OFFSET offset_n
-- LIMIT limit_n;
-- END;
-- $$ LANGUAGE plpgsql;