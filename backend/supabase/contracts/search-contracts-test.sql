CREATE OR REPLACE FUNCTION search_contracts_test(
    term TEXT,
    contract_filter TEXT,
    contract_sort TEXT,
    offset_n INTEGER,
    limit_n INTEGER,
    fuzzy BOOLEAN DEFAULT false,
    group_id TEXT DEFAULT NULL,
    creator_id TEXT DEFAULT NULL
  ) RETURNS TEXT AS $$
DECLARE base_query TEXT;
where_clause TEXT;
sql_query TEXT;
BEGIN -- Common WHERE clause
-- If fuzzy search is enabled and is group search
IF group_id is not null
and fuzzy then base_query := FORMAT(
  '
      SELECT contractz.data
      FROM (
        SELECT contracts_rbac.*,
               similarity(contracts_rbac.question, %L) AS similarity_score,
               group_contracts.group_id
        FROM contracts_rbac join group_contracts on group_contracts.contract_id = contracts_rbac.id
      ) AS contractz
      %s
      AND contractz.similarity_score > 0.1
      AND contractz.group_id = %L',
  term,
  generate_where_query(contract_filter, contract_sort, creator_id),
  group_id
);
-- If full text search is enabled and is group search
ELSIF group_id is not null then base_query := FORMAT(
  '
SELECT contractz.data
FROM (select contracts_rbac.*, group_contracts.group_id from contracts_rbac join group_contracts on group_contracts.contract_id = contracts_rbac.id) as contractz,
  websearch_to_tsquery('' english '', %L) query
      %s
AND contractz.question_fts @@ query
AND contractz.group_id = %L',
  term,
  generate_where_query(contract_filter, contract_sort, creator_id),
  group_id
);
-- If fuzzy search is enabled
ELSIF fuzzy THEN base_query := FORMAT(
  '
      SELECT contractz.data
      FROM (
        SELECT contracts_rbac.*,
               similarity(contracts_rbac.question, %L) AS similarity_score
        FROM contracts_rbac
      ) AS contractz
      %s
      AND contractz.similarity_score > 0.1',
  term,
  generate_where_query(contract_filter, contract_sort, creator_id)
);
-- If full text search is enabled
ELSE base_query := FORMAT(
  '
      SELECT contracts_rbac.data
      FROM contracts_rbac, websearch_to_tsquery(''english'', %L) query
      %s
      AND contracts_rbac.question_fts @@ query',
  term,
  generate_where_query(contract_filter, contract_sort, creator_id)
);
END IF;
sql_query := FORMAT(
  '
    %s
    %s',
  base_query,
  generate_sort_query(contract_sort, fuzzy, offset_n, limit_n)
);
RETURN sql_query;
END;
$$ LANGUAGE plpgsql;