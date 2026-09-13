begin;

set
  local lock_timeout = '2s';

set
  local statement_timeout = '30s';

-- Observations only: no trigger or changes to the trading write path.
create table if not exists
  contract_perp_hourly_stats (
    contract_id text not null,
    hour timestamptz not null,
    captured_at timestamptz not null,
    total_pool numeric not null check (
      total_pool >= 0
      and total_pool < 'Infinity'::numeric
    ),
    marked_position_value numeric check (
      marked_position_value >= 0
      and marked_position_value < 'Infinity'::numeric
    ),
    oracle_price numeric not null check (
      oracle_price > 0
      and oracle_price < 'Infinity'::numeric
    ),
    source text not null check (source in ('snapshot', 'backfill')),
    primary key (contract_id, hour),
    check (
      hour = date_trunc('hour', captured_at at time zone 'UTC') at time zone 'UTC'
    )
  );

alter table contract_perp_hourly_stats enable row level security;

drop policy if exists "read listed perp stats" on contract_perp_hourly_stats;

create policy "read listed perp stats" on contract_perp_hourly_stats for
select
  using (
    exists (
      select
        1
      from
        contracts c
      where
        c.id = contract_id
        and c.outcome_type = 'PERP'
        and c.visibility = 'public'
        and c.deleted = false
    )
  );

grant
select
  on contract_perp_hourly_stats to anon,
  authenticated;

grant all on contract_perp_hourly_stats to service_role;

create
or replace function capture_perp_hourly_stats () returns integer language plpgsql as $$
declare
  captured timestamptz := statement_timestamp();
  affected integer;
begin
  -- A single statement observes contracts and positions at the same MVCC snapshot.
  -- Match common/perps/amm.ts getPositionValue: max(cost basis + price P&L, 0).
  insert into contract_perp_hourly_stats (
    contract_id, hour, captured_at, total_pool, marked_position_value, oracle_price, source
  )
  select c.id,
    date_trunc('hour', captured at time zone 'UTC') at time zone 'UTC',
    captured,
    (c.data->>'poolLong')::numeric + (c.data->>'poolShort')::numeric,
    coalesce(sum(greatest(0, p.cost_basis +
      case when p.direction = 'long' then 1 else -1 end *
      ((c.data->>'oraclePrice')::numeric - p.entry_price) / p.entry_price * p.size
    )) filter (where p.size > 0), 0),
    (c.data->>'oraclePrice')::numeric,
    'snapshot'
  from contracts c
  left join contract_perp_positions p on p.contract_id = c.id and p.size > 0
  where c.outcome_type = 'PERP' and c.deleted = false
  group by c.id
  on conflict (contract_id, hour) do update set
    captured_at = excluded.captured_at,
    total_pool = excluded.total_pool,
    marked_position_value = excluded.marked_position_value,
    oracle_price = excluded.oracle_price,
    source = excluded.source;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function capture_perp_hourly_stats ()
from
  public,
  anon,
  authenticated;

grant
execute on function capture_perp_hourly_stats () to service_role;

-- Existing funding observations supply real historical backing. Trader claims
-- are left unknown until the opt-in replay backfill can reconstruct them.
insert into
  contract_perp_hourly_stats (
    contract_id,
    hour,
    captured_at,
    total_pool,
    oracle_price,
    source
  )
select distinct
  on (
    f.contract_id,
    date_trunc('hour', f.ts at time zone 'UTC')
  ) f.contract_id,
  date_trunc('hour', f.ts at time zone 'UTC') at time zone 'UTC',
  f.ts,
  f.pool_long_after + f.pool_short_after,
  f.oracle_price,
  'backfill'
from
  contract_perp_funding_events f
  join contracts c on c.id = f.contract_id
where
  c.outcome_type = 'PERP'
  and c.deleted = false
order by
  f.contract_id,
  date_trunc('hour', f.ts at time zone 'UTC'),
  f.ts desc
on conflict (contract_id, hour) do nothing;

select
  capture_perp_hourly_stats ();

commit;
