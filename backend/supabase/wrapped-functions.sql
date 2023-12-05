-- drop function get_monthly_bet_count_and_amount (user_id_input text);



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
        SUM(ABS(amount)) AS total_amount  -- Add this line to calculate the sum of amounts
    FROM
        contract_bets
    WHERE
        user_id = user_id_input AND
        created_time >= '2023-01-01' AND
        created_time <= '2024-01-01' AND
        is_ante = false AND
        is_redemption = false
    GROUP BY
        date_trunc('month', created_time)
    ORDER BY
        month;
END;
$$ language plpgsql;

-- drop function get_user_portfolio_at_2023_start (p_user_id text);

create
or replace function get_user_portfolio_at_2023_start (p_user_id text) returns table (
  -- Add the column definitions here. For example:
  user_id text,
  ts timestamp without time zone,
  investment_value numeric,
  balance numeric,
  total_deposits numeric,
  loan_total numeric,
  id bigint
  -- Add other columns as per your 'user_portfolio_history' table
) as $$
BEGIN
    RETURN QUERY
    (SELECT *
     FROM user_portfolio_history
     WHERE user_portfolio_history.user_id = p_user_id
       AND user_portfolio_history.ts < '2023-01-02'
       AND user_portfolio_history.ts > '2022-12-31'
     ORDER BY ABS(EXTRACT(EPOCH FROM (user_portfolio_history.ts - '2023-01-01'::date)))
     LIMIT 1)
    UNION ALL
    -- Query for users who created their portfolio after February 2023
    (SELECT *
     FROM user_portfolio_history
     WHERE user_portfolio_history.user_id = p_user_id
       AND user_portfolio_history.ts >= '2023-01-02'
     ORDER BY user_portfolio_history.ts
     LIMIT 1)
    LIMIT 1;
END;
$$ language plpgsql;

-- drop function get_user_portfolio_at_2023_end (p_user_id text);

create
or replace function get_user_portfolio_at_2023_end (p_user_id text) returns table (
  -- Add the column definitions here. For example:
  user_id text,
  ts timestamp without time zone,
  investment_value numeric,
  balance numeric,
  total_deposits numeric,
  loan_total numeric,
  id bigint
  -- Add other columns as per your 'user_portfolio_history' table
) as $$
BEGIN
    RETURN QUERY
    (SELECT *
     FROM user_portfolio_history
     WHERE user_portfolio_history.user_id = p_user_id
   AND user_portfolio_history.ts < '2024-01-02'
   AND user_portfolio_history.ts > '2023-12-31'
 ORDER BY ABS(EXTRACT(EPOCH FROM (user_portfolio_history.ts - '2023-01-01'::date)))
     LIMIT 1)
    UNION ALL
    -- Query for users who created their portfolio after February 2023
    (SELECT *
     FROM user_portfolio_history
     WHERE user_portfolio_history.user_id = p_user_id
   AND user_portfolio_history.ts < '2024-01-01'
     ORDER BY user_portfolio_history.ts desc
     LIMIT 1)
    LIMIT 1;
END;
$$ language plpgsql;
