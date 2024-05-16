create table if not exists user_portfolio_history_latest (
  user_id text primary key,
  ts timestamp not null,
  investment_value numeric not null,
  balance numeric not null,
  spice_balance numeric not null,
  total_deposits numeric not null,
  loan_total numeric,
  profit numeric,
  last_calculated timestamp not null default now() -- We don't insert new rows to u_p_h if no metrics have changed
);

create or replace function update_user_portfolio_history_latest()
returns trigger as $$
begin
  insert into user_portfolio_history_latest (user_id, ts, investment_value, balance, total_deposits, spice_balance, loan_total, last_calculated)
  values (new.user_id, new.ts, new.investment_value, new.balance, new.total_deposits, new.spice_balance, new.loan_total, new.ts)
  on conflict (user_id) do update
  set ts = excluded.ts,
      investment_value = excluded.investment_value,
      balance = excluded.balance,
      total_deposits = excluded.total_deposits,
      spice_balance = excluded.spice_balance,
      loan_total = excluded.loan_total,
      profit = excluded.profit,
      last_calculated = excluded.ts
  where user_portfolio_history_latest.ts < excluded.ts;
  return new;
end;
$$ language plpgsql;

create trigger user_portfolio_history_insert
after insert on user_portfolio_history
for each row execute function update_user_portfolio_history_latest();