-- Create a function to update contracts in batches
drop function if exists update_contract_tiers_efficient(batch_size INTEGER, start_time TIMESTAMP );
create
or replace function update_contract_tiers_efficient (batch_size integer, start_time timestamp) returns table (
  updated_count integer,
  last_updated_time timestamp
) as $$
DECLARE
  batch_updated INTEGER;
  last_updated_timestamp TIMESTAMP;
BEGIN
  WITH to_update AS (
    SELECT 
      id, 
      created_time,
      get_tier_from_liquidity_efficient(
        outcome_type, 
        CASE WHEN data ? 'answers' THEN jsonb_array_length(data->'answers') ELSE NULL END,
        COALESCE((data->>'totalLiquidity')::NUMERIC, 0)
      ) AS new_tier
    FROM contracts
    WHERE created_time > start_time
    AND (data->>'totalLiquidity' IS NOT NULL)
    ORDER BY created_time
    LIMIT batch_size
  )
  UPDATE contracts c
  SET data = c.data || jsonb_build_object('marketTier', tu.new_tier)
  FROM to_update tu
  WHERE c.id = tu.id
  AND (c.tier IS DISTINCT FROM tu.new_tier OR c.tier IS NULL);

  GET DIAGNOSTICS batch_updated = ROW_COUNT;
  
  IF batch_updated > 0 THEN
    SELECT created_time INTO last_updated_timestamp
    FROM contracts
    WHERE created_time > start_time
    ORDER BY created_time
    LIMIT 1 OFFSET (batch_size - 1);
  ELSE
    last_updated_timestamp := start_time;
  END IF;

  RETURN QUERY SELECT batch_updated, last_updated_timestamp;
END;
$$ language plpgsql;

-- Commit the transaction to save the functions
commit;

