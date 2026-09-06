begin;

-- Install capture and seed current balances under the same write lock. Old
-- API/scheduler instances can keep running after commit: the trigger records
-- their pool changes too, so rolling deployment cannot leave a history gap.
-- Drain SELECT FOR UPDATE holders too before altering the event table; pool
-- writers acquire the contract lock before inserting their detailed event.
lock table contracts in access exclusive mode;

alter table contract_perp_pool_events
drop constraint contract_perp_pool_events_event_type_check;

alter table contract_perp_pool_events
add constraint contract_perp_pool_events_event_type_check check (
  event_type in (
    'baseline',
    'snapshot',
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
);

-- Snapshots are observations, not additional cash movements. Keep them
-- separate from the application's detailed accounting events in this ledger.
create index if not exists contract_perp_pool_snapshots_contract_applied on contract_perp_pool_events (contract_id, applied_ts desc, id desc)
where
  event_type = 'snapshot';

create
or replace function capture_perp_pool_snapshot () returns trigger language plpgsql as $$
declare
  pool_long numeric := (new.data ->> 'poolLong')::numeric;
  pool_short numeric := (new.data ->> 'poolShort')::numeric;
begin
  if tg_op = 'UPDATE' then
    if old.outcome_type = 'PERP'
      and pool_long is not distinct from (old.data ->> 'poolLong')::numeric
      and pool_short is not distinct from (old.data ->> 'poolShort')::numeric then
      return new;
    end if;
  end if;

  insert into contract_perp_pool_events (
    contract_id, event_type, applied_ts,
    pool_long_before, pool_long_after, pool_short_before, pool_short_after
  ) values (
    new.id, 'snapshot', clock_timestamp(),
    pool_long, pool_long, pool_short, pool_short
  );
  return new;
end;
$$;

drop trigger if exists contract_perp_pool_snapshot on contracts;

create trigger contract_perp_pool_snapshot
after insert
or
update on contracts for each row when (new.outcome_type = 'PERP')
execute function capture_perp_pool_snapshot ();

-- Earlier application-only history may contain deployment gaps. Start the
-- continuous chart at this snapshot rather than inventing historical L/S.
-- The predicate makes a migration retry preserve the original start date.
insert into
  contract_perp_pool_events (
    contract_id,
    event_type,
    applied_ts,
    pool_long_before,
    pool_long_after,
    pool_short_before,
    pool_short_after,
    data
  )
select
  id,
  'snapshot',
  clock_timestamp(),
  (data ->> 'poolLong')::numeric,
  (data ->> 'poolLong')::numeric,
  (data ->> 'poolShort')::numeric,
  (data ->> 'poolShort')::numeric,
  jsonb_build_object('reason', 'database-tracking-start')
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
      and event.event_type = 'snapshot'
  );

commit;
