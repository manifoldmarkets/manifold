create table if not exists
  txns (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null
  );

alter table txns enable row level security;

drop policy if exists "public read" on txns;

create policy "public read" on txns for
select
  using (true);

create index if not exists txns_data_gin on txns using GIN (data);

alter table txns
cluster on txns_pkey;

-- for querying top market_ads
create index if not exists txns_category on txns ((data ->> 'category'), (data ->> 'toId'));

create index if not exists txns_to_created_time on txns (
  (data ->> 'toId'),
  ((data -> 'createdTime')::bigint) desc
);

create index if not exists txns_from_created_time on txns (
  (data ->> 'fromId'),
  ((data -> 'createdTime')::bigint) desc
);

create
or replace function get_daily_claimed_boosts (user_id text) returns table (total numeric) as $$
with daily_totals as (
    select
        SUM((t.data->'amount')::numeric) as total
    from txns t
    where t.fs_updated_time > now() - interval '1 day'
      and t.data->>'category' = 'MARKET_BOOST_REDEEM'
      and t.data->>'toId' = user_id
    group by date_trunc('day', t.fs_updated_time)
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
    select data->>'toId' as charity_id,
           count(distinct data->>'fromId') as num_supporters,
           sum((data->'amount')::numeric) as total
    from txns
    where data->>'category' = 'CHARITY'
    group by data->>'toId'
    order by total desc
$$ language sql;
