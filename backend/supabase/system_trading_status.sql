create table if not exists
  system_trading_status (token text primary key, status boolean not null);

alter table system_trading_status enable row level security;

create policy "public read" on system_trading_status for
select
  using (true);

-- Insert initial values for M$ and CASH tokens
insert into
  system_trading_status (token, status)
values
  ('MANA', true),
  ('CASH', true)
on conflict (token) do nothing;
