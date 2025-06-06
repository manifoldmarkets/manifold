-- Add new columns for including users with negative mana balances and all users
alter table mana_supply_stats
add column if not exists full_total_mana_value numeric,
add column if not exists full_mana_balance numeric,
add column if not exists full_spice_balance numeric,
add column if not exists full_investment_value numeric,
add column if not exists full_loan_total numeric;

-- Add a comment to explain the difference between the new and existing columns
comment on table mana_supply_stats is 'Stores mana supply statistics. Columns prefixed with "full_" include all users, including those with negative balances. Non-prefixed columns only include users with positive balances.';
