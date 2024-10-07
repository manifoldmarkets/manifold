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
  IF outcome_type IN ('POLL', 'BOUNTIED_QUESTION') THEN
    RETURN NULL;
  END IF;

  ante := CASE outcome_type
    WHEN 'BINARY' THEN fixed_ante
    WHEN 'MULTIPLE_CHOICE' THEN GREATEST(fixed_ante / 10 * COALESCE(num_answers, 0), multiple_choice_minimum_cost)
    WHEN 'FREE_RESPONSE' THEN fixed_ante / 10
    WHEN 'PSEUDO_NUMERIC' THEN fixed_ante * 2.5
    WHEN 'STONK' THEN fixed_ante
    WHEN 'NUMBER' THEN fixed_ante * 10
    ELSE fixed_ante
  END;

  -- Special handling for NUMBER type
IF outcome_type = 'NUMBER' THEN
  IF liquidity >= (ante * 10) THEN 
    RETURN 'crystal';
  ELSIF liquidity >= ante THEN 
    RETURN 'premium';
  ELSIF liquidity >= (ante / 10) THEN 
    RETURN 'plus';
  ELSE 
    RETURN 'play';
  END IF;
END IF;

  -- For other types
  IF liquidity >= ante * 100 THEN RETURN 'crystal';
  ELSIF liquidity >= ante * 10 THEN RETURN 'premium';
  ELSIF liquidity >= ante  THEN RETURN 'plus';
  ELSE RETURN 'play';
  END IF;
END;
$$ language plpgsql immutable;
