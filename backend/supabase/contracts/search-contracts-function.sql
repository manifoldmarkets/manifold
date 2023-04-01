CREATE OR REPLACE FUNCTION search_contracts(
  term TEXT,
  contract_filter TEXT,
  contract_sort TEXT
) RETURNS TABLE (
  data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT contracts_rbac.data
  FROM contracts_rbac, websearch_to_tsquery('english', term) query
  WHERE contracts_rbac.question_fts @@ query 
    AND (
    (contract_filter = 'open' AND contracts_rbac.resolution_time IS NULL)
    OR (contract_filter = 'closed' AND contracts_rbac.close_time <  NOW() and contracts_rbac.resolution_time IS NULL)
    OR (contract_filter = 'resolved' AND contracts_rbac.resolution_time IS NOT NULL)
    OR (contract_filter = 'all')
  )
  AND (contract_sort != 'close-date' OR (contract_sort = 'close-date' AND contracts_rbac.close_time > NOW()))
ORDER BY
  CASE contract_sort
    WHEN 'relevance' THEN ts_rank_cd(contracts_rbac.question_fts, query)
    END DESC NULLS LAST,
  CASE contract_sort
    WHEN 'score' THEN contracts_rbac.popularity_score
    WHEN 'daily-score' THEN (contracts_rbac.data->>'dailyScore')::numeric
    WHEN '24-hour-vol' THEN (contracts_rbac.data->>'volume24Hours')::numeric
    WHEN 'liquidity' THEN (contracts_rbac.data->>'elasticity')::numeric
    WHEN 'last-updated' THEN (contracts_rbac.data->>'lastUpdatedTime')::numeric
    END DESC NULLS LAST,
  CASE contract_sort
    WHEN 'most-popular' THEN (contracts_rbac.data->>'uniqueBettorCount')::integer
    END DESC NULLS LAST,
  CASE contract_sort
    WHEN 'newest' THEN contracts_rbac.created_time
    WHEN 'resolve-date' THEN contracts_rbac.resolution_time
  END DESC NULLS LAST,
  CASE WHEN contract_sort = 'close-date' THEN contracts_rbac.close_time END ASC NULLS LAST
  ;
END;
$$ LANGUAGE plpgsql;

drop function search_contracts_fuzzy(text, text, text);
CREATE OR REPLACE FUNCTION search_contracts_fuzzy(
  term TEXT,
  contract_filter TEXT,
  contract_sort TEXT
) RETURNS TABLE (
  data jsonb
--   similarity_score numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT contracts_rbac.data
--   ,similarity(question,term) as similarity_score
  FROM contracts_rbac
  WHERE similarity(question,term)>0.1
    AND (
    (contract_filter = 'open' AND contracts_rbac.resolution_time IS NULL)
    OR (contract_filter = 'closed' AND contracts_rbac.close_time <  NOW() and contracts_rbac.resolution_time IS NULL)
    OR (contract_filter = 'resolved' AND contracts_rbac.resolution_time IS NOT NULL)
    OR (contract_filter = 'all')
  )
  AND (contract_sort != 'close-date' OR (contract_sort = 'close-date' AND contracts_rbac.close_time > NOW()))
ORDER BY
  CASE contract_sort
    WHEN 'relevance' THEN similarity(question,term)
    WHEN 'score' THEN contracts_rbac.popularity_score
    WHEN 'daily-score' THEN (contracts_rbac.data->>'dailyScore')::numeric
    WHEN '24-hour-vol' THEN (contracts_rbac.data->>'volume24Hours')::numeric
    WHEN 'liquidity' THEN (contracts_rbac.data->>'elasticity')::numeric
    WHEN 'last-updated' THEN (contracts_rbac.data->>'lastUpdatedTime')::numeric
    END DESC NULLS LAST,
  CASE contract_sort
    WHEN 'most-popular' THEN (contracts_rbac.data->>'uniqueBettorCount')::integer
    END DESC NULLS LAST,
  CASE contract_sort
    WHEN 'newest' THEN contracts_rbac.created_time
    WHEN 'resolve-date' THEN contracts_rbac.resolution_time
  END DESC NULLS LAST,
  CASE WHEN contract_sort = 'close-date' THEN contracts_rbac.close_time END ASC NULLS LAST
  ;
END;
$$ LANGUAGE plpgsql;

