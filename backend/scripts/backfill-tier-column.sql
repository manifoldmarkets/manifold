-- Start the transaction
begin;

-- Create a more efficient function to get the tier from liquidity
create
or replace function get_tier_from_liquidity_efficient (
  outcome_type text,
  num_answers integer,
  liquidity numeric
) returns text as $$
DECLARE
  ante NUMERIC;
  tier_liquidity NUMERIC;
  fixed_ante CONSTANT NUMERIC := 1000;
  multiple_choice_minimum_cost CONSTANT NUMERIC := 1000;
BEGIN
  -- Check for valid outcome type
  IF outcome_type NOT IN ('BINARY', 'MULTIPLE_CHOICE', 'PSEUDO_NUMERIC', 'STONK', 'BOUNTIED_QUESTION', 'POLL', 'NUMBER', 'FREE_RESPONSE') THEN
    RAISE EXCEPTION 'Invalid outcome type: %', outcome_type;
  END IF;

  ante := CASE outcome_type
    WHEN 'BINARY' THEN fixed_ante
    WHEN 'MULTIPLE_CHOICE' THEN GREATEST(fixed_ante / 10 * COALESCE(num_answers, 0), multiple_choice_minimum_cost)
    WHEN 'FREE_RESPONSE' THEN fixed_ante / 10
    WHEN 'PSEUDO_NUMERIC' THEN fixed_ante * 2.5
    WHEN 'STONK' THEN fixed_ante
    WHEN 'BOUNTIED_QUESTION' THEN 0
    WHEN 'POLL' THEN fixed_ante / 10
    WHEN 'NUMBER' THEN fixed_ante * 10
    ELSE fixed_ante
  END;

  IF outcome_type IN ('POLL', 'BOUNTIED_QUESTION') THEN
    RETURN 'play';
  END IF;

  -- Special handling for NUMBER type
  IF outcome_type = 'NUMBER' THEN
    IF liquidity >= ante * 100 THEN RETURN 'crystal';
    ELSIF liquidity >= ante * 10 THEN RETURN 'premium';
    ELSIF liquidity >= ante THEN RETURN 'plus';
    ELSE RETURN 'play';
    END IF;
  END IF;

  -- For other types
  IF liquidity >= ante * 1000 THEN RETURN 'crystal';
  ELSIF liquidity >= ante * 100 THEN RETURN 'premium';
  ELSIF liquidity >= ante * 10 THEN RETURN 'plus';
  ELSE RETURN 'play';
  END IF;
END;
$$ language plpgsql immutable;

-- Create a function to update contracts in batches
create
or replace function update_contract_tiers_efficient (batch_size integer, start_id text) returns table (updated_count integer, last_id text) as $$
DECLARE
  batch_updated INTEGER;
  last_updated_id TEXT;
BEGIN
  WITH to_update AS (
    SELECT 
      id, 
      get_tier_from_liquidity_efficient(
        data->>'outcomeType', 
        CASE WHEN data ? 'answers' THEN jsonb_array_length(data->'answers') ELSE NULL END,
        COALESCE((data->>'totalLiquidity')::NUMERIC, 0)
      ) AS new_tier
    FROM contracts
    WHERE id > start_id
    AND (
      data->>'totalLiquidity' IS NOT NULL
    )
    ORDER BY id
    LIMIT batch_size
  )
  UPDATE contracts c
  SET tier = tu.new_tier
  FROM to_update tu
  WHERE c.id = tu.id
  AND (c.tier IS DISTINCT FROM tu.new_tier OR c.tier IS NULL);

  GET DIAGNOSTICS batch_updated = ROW_COUNT;
  
  IF batch_updated > 0 THEN
    SELECT id INTO last_updated_id
    FROM contracts
    WHERE id > start_id
    ORDER BY id
    LIMIT 1 OFFSET (batch_size - 1);
  ELSE
    last_updated_id := start_id;
  END IF;

  RETURN QUERY SELECT batch_updated, last_updated_id;
END;
$$ language plpgsql;

-- Commit the transaction to save the functions
commit;

-- Now you can call the update_contract_tiers_efficient function
select
  *
from
  update_contract_tiers_efficient (50, '');
