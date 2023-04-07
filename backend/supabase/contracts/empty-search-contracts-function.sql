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
  generate_sort_query(contract_sort, offset_n, limit_n, true)
);
RETURN QUERY EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql;
-- generates latter half of search query