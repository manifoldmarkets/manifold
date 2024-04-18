create table if not exists user_portfolio_history_latest (
  user_id text primary key,
  ts timestamp not null,
  investment_value numeric not null,
  balance numeric not null,
  spice_balance numeric not null,
  total_deposits numeric not null,
  loan_total numeric
);

create or replace function update_user_portfolio_history_latest()
returns trigger as $$
begin
  insert into user_portfolio_history_latest (user_id, ts, investment_value, balance, total_deposits, loan_total)
  values (new.user_id, new.ts, new.investment_value, new.balance, new.total_deposits, new.loan_total)
  on conflict (user_id) do update
  set ts = excluded.ts,
      investment_value = excluded.investment_value,
      balance = excluded.balance,
      spice_balance = excluded.spice_balance,
      total_deposits = excluded.total_deposits,
      loan_total = excluded.loan_total
  where user_portfolio_history_latest.ts < excluded.ts;
  return new;
end;
$$ language plpgsql;

create trigger user_portfolio_history_insert
after insert on user_portfolio_history
for each row execute function update_user_portfolio_history_latest();