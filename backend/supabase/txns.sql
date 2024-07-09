create table if not exists
  txns (
    id text not null primary key default random_alphanumeric (8),
    data jsonb not null,
    created_time timestamptz not null default now(),
    from_id text not null,
    from_type text not null,
    to_id text not null,
    to_type text not null,
    amount numeric not null,
    token text not null default 'M$',
    category text not null,
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
      sum(case when token = 'M$'
        then amount / 100
        else amount / 1000 end
      ) as total
    from txns
    where category = 'CHARITY'
    group by to_id
    order by total desc
$$ language sql;

create index if not exists txns_category_to_id on txns (category, to_id);

create index if not exists txns_category_native on txns (category);

create index if not exists txns_to_created_time on txns (to_id, created_time);

create index if not exists txns_from_created_time on txns (from_id, created_time);

create index if not exists txns_category_to_id_from_id on txns (category, to_id, from_id)
