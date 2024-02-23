create table if not exists
  txns (
    id text not null primary key,
    data jsonb not null,
    created_time timestamptz default now(),
    from_id text,
    from_type text,
    to_id text,
    to_type text,
    amount numeric,
    category text,
    fs_updated_time timestamp not null
  );

alter table txns enable row level security;

drop policy if exists "public read" on txns;

create policy "public read" on txns for
select
  using (true);

create
or replace function txns populate_cols () returns trigger language plpgsql as $$
begin
    if new.data is not null then
    new.created_time :=
        case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;
    new.from_id := (new.data ->> 'fromId');
    new.from_type := (new.data ->> 'fromType');
    new.to_id := (new.data ->> 'toId');
    new.to_type := (new.data ->> 'toType');
    new.amount := (new.data ->> 'amount')::numeric;
    new.category := (new.data ->> 'category');
    end if;
    return new;
end
$$;

create trigger txns populate before insert
or
update on txns for each row
execute function txns populate_cols ();

create
or replace function get_daily_claimed_boosts (user_id text) returns table (total numeric) as $$
with daily_totals as (
    select
        SUM((t.amount) as total
    from txns t
    where t.fs_updated_time > now() - interval '1 day'
      and t.category = 'MARKET_BOOST_REDEEM'
      and t.to_id = user_id
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
    select to_id as charity_id,
           count(distinct from_id) as num_supporters,
           sum(amount) as total
    from txns
    where category = 'CHARITY'
    group by to_id
    order by total desc
$$ language sql;

tegory
