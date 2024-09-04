-- Add cash_bet_amount column to daily_stats table
alter table daily_stats
add column if not exists cash_bet_amount numeric;

-- Add new columns to mana_supply_stats table
alter table mana_supply_stats
add column if not exists total_cash_value numeric not null default 0,
add column if not exists cash_balance numeric not null default 0,
add column if not exists cash_investment_value numeric not null default 0,
add column if not exists amm_cash_liquidity numeric not null default 0;

-- Add cash_amount column to txn_summary_stats table
alter table txn_summary_stats
add column if not exists cash_amount numeric not null default 0;
