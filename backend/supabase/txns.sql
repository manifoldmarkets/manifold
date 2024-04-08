create table if not exists
  txns (
    id text not null primary key default random_alphanumeric (8),
    data jsonb not null,
    created_time timestamptz default now(),
    from_id text not null,
    from_type text not null,
    to_id text not null,
    to_type text not null,
    amount numeric not null,
    category text not null,
    fs_updated_time timestamp
  );

alter table txns enable row level security;

drop policy if exists "public read" on txns;

create policy "public read" on txns for
select
  using (true);

create
or replace function get_daily_claimed_boosts (user_id text) returns table (total numeric) as $$
with daily_totals as (
    select
        SUM(t.amount) as total
    from txns t
    where t.created_time > now() - interval '1 day'
      and t.category = 'MARKET_BOOST_REDEEM'
      and t.to_id = user_id
    group by date_trunc('day', t.created_time)
)
select total from daily_totals
order by total desc;
$$ language sql;

create
or replace function get_donations_by_charity () returns table (
  charity_id text,
  num_supporters bigint,
  total numeric
) as $$
    select to_id as charity_id,
           count(distinct from_id) as num_supporters,
           sum(amount) as total
    from txns
    where category = 'CHARITY'
    group by to_id
    order by total desc
$$ language sql;

tegory
