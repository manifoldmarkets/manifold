create or replace function get_daily_claimed_boosts(user_id text)
    returns table (total numeric) as $$
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

create or replace function get_donations_by_charity() returns table (charity_id text, total numeric) as $$
    select data->>'toId' as charity_id, sum((data->'amount')::numeric) as total
    from txns
    where data->>'category' = 'CHARITY'
    group by data->>'toId'
    order by total desc
$$ language sql;
