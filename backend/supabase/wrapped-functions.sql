
create
or replace function get_monthly_bet_count_and_amount (user_id_input text) returns table (
  month TIMESTAMPTZ,
  bet_count bigint,
  total_amount numeric
) as $$
BEGIN
    RETURN QUERY
    SELECT
        date_trunc('month', created_time) AS month,
        COUNT(bet_id) AS bet_count,
        SUM(amount) AS total_amount  -- Add this line to calculate the sum of amounts
    FROM
        contract_bets
    WHERE
        user_id = user_id_input AND
        created_time >= '2023-01-01' AND
        created_time <= '2024-01-01' AND
        is_ante = false
    GROUP BY
        date_trunc('month', created_time)
    ORDER BY
        month;
END;
$$ language plpgsql;


CREATE OR REPLACE FUNCTION calculate_user_profit_for_2023(user_id_input TEXT)
RETURNS NUMERIC AS $$
DECLARE
    total_profit NUMERIC;
BEGIN
    SELECT SUM(profit) INTO total_profit
    FROM public.user_contract_metrics
    WHERE user_id = user_id_input
    AND fs_updated_time >= '2023-01-01'::TIMESTAMPTZ
    AND fs_updated_time < '2024-01-01'::TIMESTAMPTZ;

    RETURN COALESCE(total_profit, 0); -- Return 0 if the sum is NULL
END;
$$ LANGUAGE plpgsql;