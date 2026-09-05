begin;

-- Append-only pool history for public economics and risk reporting. This is
-- written in the same transaction as each backing-pool mutation; no scheduler
-- is required to construct or repair it later.
create table if not exists
  contract_perp_pool_events (
    id bigserial primary key,
    contract_id text not null,
    event_type text not null check (
      event_type in (
        'baseline',
        'create',
        'open',
        'add',
        'flip',
        'close',
        'subsidy',
        'oracle',
        'funding',
        'resolve'
      )
    ),
    applied_ts timestamptz not null default statement_timestamp(),
    oracle_ts timestamptz,
    oracle_price numeric constraint contract_perp_pool_events_oracle_price_check check (
      oracle_price is null
      or oracle_price > 0
    ),
    pool_long_before numeric not null check (pool_long_before >= 0),
    pool_long_after numeric not null check (pool_long_after >= 0),
    pool_short_before numeric not null check (pool_short_before >= 0),
    pool_short_after numeric not null check (pool_short_after >= 0),
    cash_in numeric not null default 0 check (cash_in >= 0),
    cash_out numeric not null default 0 check (cash_out >= 0),
    data jsonb,
    constraint contract_perp_pool_events_pool_cash_balance_check check (
      abs(
        pool_long_before + pool_short_before + cash_in - cash_out - pool_long_after - pool_short_after
      ) <= 0.001
    )
  );

create index if not exists contract_perp_pool_events_contract_applied on contract_perp_pool_events (contract_id, applied_ts desc, id desc);

create index if not exists contract_perp_pool_events_applied on contract_perp_pool_events (applied_ts, contract_id);

create
or replace function prevent_perp_pool_event_mutation () returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return old;
  end if;
  raise exception 'PERP pool events are append-only (event %)', old.id;
end;
$$;

drop trigger if exists contract_perp_pool_events_immutable on contract_perp_pool_events;

create trigger contract_perp_pool_events_immutable before
update
or delete on contract_perp_pool_events for each row
execute function prevent_perp_pool_event_mutation ();

alter table contract_perp_pool_events enable row level security;

drop policy if exists "public read perp pool events" on contract_perp_pool_events;

create policy "public read perp pool events" on contract_perp_pool_events for
select
  using (true);

-- Existing histories cannot reliably reconstruct the L/S partition. Seed one
-- honest current-state baseline; subsequent history is complete and exact.
insert into
  contract_perp_pool_events (
    contract_id,
    event_type,
    applied_ts,
    oracle_ts,
    oracle_price,
    pool_long_before,
    pool_long_after,
    pool_short_before,
    pool_short_after,
    data
  )
select
  id,
  'baseline',
  statement_timestamp(),
  case
    when data ? 'oraclePriceTime' then to_timestamp(
      (data ->> 'oraclePriceTime')::double precision / 1000
    )
    else null
  end,
  (data ->> 'oraclePrice')::numeric,
  (data ->> 'poolLong')::numeric,
  (data ->> 'poolLong')::numeric,
  (data ->> 'poolShort')::numeric,
  (data ->> 'poolShort')::numeric,
  jsonb_build_object('reason', 'tracking-start')
from
  contracts
where
  outcome_type = 'PERP'
  and not exists (
    select
      1
    from
      contract_perp_pool_events event
    where
      event.contract_id = contracts.id
  );

commit;
