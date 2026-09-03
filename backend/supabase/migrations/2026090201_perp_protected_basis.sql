-- ManiPerp protected-basis settlement (Workstream A): additive schema plus
-- the DATABASE-ENFORCED accounting-epoch guard.
--
-- What this adds
--   contract_perp_positions.reserve_basis        b, the protected basis (nullable)
--   contract_perp_positions.accounting_epoch     stamp
--   contract_perp_events.reserve_basis_delta     Δb (default 0 = "no history")
--   contract_perp_events.accounting_mode/epoch   stamps
--   contract_perp_events.event_type              + 'basis-settlement', 'accounting-activation'
--   contract_perp_funding_events.accounting_epoch
--   contract_perp_accounting_epochs              immutable activation records
--   contract_perp_shadow_checkpoints             isolated accounting-shadow state
--   contract_perp_risk_shadow                    isolated risk-policy shadow state
--   perp_accounting_guard()                      trigger on the three perp tables
--   perp_accounting_contract_guard()             trigger on contracts (mode/epoch
--                                                flips; protected pool, mark and
--                                                halt changes)
--
-- Semantics
--   A contract's mode lives in contracts.data->>'perpAccountingMode'
--   (legacy | shadow | protected; absent = legacy) with its epoch in
--   contracts.data->>'perpAccountingEpoch' (absent = 0). The engine reads both
--   under the contract advisory lock.
--
--   For LEGACY and SHADOW contracts the guard MIRRORS: every position write
--   gets reserve_basis = cost_basis and every event write gets
--   reserve_basis_delta = cost_basis_delta, whatever the writer sent. That is
--   the legacy definition of b, so a pre-column binary keeps producing correct
--   rows. Old EVENT rows keep the default 0: they carry no protected-basis
--   history and reconstruction must start at the activation snapshot.
--
--   For PROTECTED contracts the guard REQUIRES the writing transaction to have
--   presented the contract's current epoch via
--     select set_config('perp.accounting_epoch', '<epoch>', true)
--   (transaction-local) and every row to be stamped with that epoch; positions
--   must carry an explicit reserve_basis, events must be stamped 'protected'.
--   A binary that predates protected accounting never sets the GUC, so its
--   first position/event write on a protected contract raises and its whole
--   transaction — ledger txns, contract patch, metrics — rolls back. Draining
--   old instances is still required operationally, but it is not the
--   enforcement boundary; this is.
--
--   Contract-level FINANCIAL changes on a protected contract are guarded the
--   same way: poolLong/poolShort, the oracle mark and its timestamps, and the
--   solvency-halt fields may only change in a transaction that presented the
--   epoch. A pre-protected scheduler can commit a legacy cross-side transfer
--   through its price-only fast path without touching a single position or
--   event row, and can commit a price-only tick on which protected
--   accounting would have settled a position — an unhalted, protected-invalid
--   book the version-aware scheduler then skips as a duplicate point. Both
--   are refused, so that scheduler's whole tick rolls back: the mark freezes
--   rather than lies, until the version-aware scheduler runs.
--
-- DEPLOY ORDER
--   1. Apply this migration (additive; safe with the current API/scheduler:
--      their writes are mirrored by the guard and nothing is protected yet).
--   2. Deploy the version-aware API, wait for full rollout, drain old
--      instances; THEN deploy the version-aware scheduler.
--   3. Only then may any contract be moved to shadow or protected, and only
--      through backend/scripts/perp-protected-basis-preflight.ts, which sets
--      perp.accounting_transition inside the same transaction.
--   Nothing here activates protected accounting on any contract.
--
-- Rollback of this migration itself (before any activation) is: drop the two
-- trigger functions' triggers, then the columns/table. After an activation
-- see the runbook's rollback boundary — a schema drop is not a rollback.

begin;

-- ---------------------------------------------------------------------
-- 1. Positions: protected basis and epoch stamp
-- ---------------------------------------------------------------------
alter table contract_perp_positions
  add column if not exists reserve_basis numeric,
  add column if not exists accounting_epoch bigint not null default 0;

alter table contract_perp_positions
  drop constraint if exists contract_perp_positions_reserve_basis_check;
alter table contract_perp_positions
  add constraint contract_perp_positions_reserve_basis_check
  check (
    reserve_basis is null
    or (reserve_basis >= 0 and reserve_basis <= cost_basis)
  );

comment on column contract_perp_positions.reserve_basis is
  'b: value still protected by the own side pool; 0 <= b <= cost_basis. Null only on rows an old writer touched before the guard existed; legacy contracts mirror cost_basis';
comment on column contract_perp_positions.accounting_epoch is
  'contracts.data->>perpAccountingEpoch at the time of the last write';

-- Every existing contract is legacy, and the legacy definition of b is c.
update contract_perp_positions
set reserve_basis = cost_basis
where reserve_basis is null;

-- ---------------------------------------------------------------------
-- 2. Events: Δb, stamps, new event types
-- ---------------------------------------------------------------------
alter table contract_perp_events
  add column if not exists reserve_basis_delta numeric not null default 0,
  add column if not exists accounting_epoch bigint not null default 0,
  add column if not exists accounting_mode text not null default 'legacy';

alter table contract_perp_events
  drop constraint if exists contract_perp_events_event_type_check;
alter table contract_perp_events
  add constraint contract_perp_events_event_type_check
  check (
    event_type in (
      'open', 'add', 'close', 'liquidation', 'adl', 'funding',
      'basis-settlement', 'accounting-activation'
    )
  );

alter table contract_perp_events
  drop constraint if exists contract_perp_events_accounting_mode_check;
alter table contract_perp_events
  add constraint contract_perp_events_accounting_mode_check
  check (accounting_mode in ('legacy', 'shadow', 'protected'));

comment on column contract_perp_events.reserve_basis_delta is
  'Δb. Mirrors cost_basis_delta on legacy/shadow contracts; explicit under protected accounting. Rows older than this column read 0 and carry no protected-basis history';

-- ---------------------------------------------------------------------
-- 3. Funding summaries: epoch stamp
-- ---------------------------------------------------------------------
alter table contract_perp_funding_events
  add column if not exists accounting_epoch bigint not null default 0;

-- ---------------------------------------------------------------------
-- 4. Immutable activation records
-- ---------------------------------------------------------------------
create table if not exists contract_perp_accounting_epochs (
  id bigint primary key generated by default as identity,
  contract_id text not null,
  epoch bigint not null check (epoch > 0),
  accounting_mode text not null
    check (accounting_mode in ('legacy', 'shadow', 'protected')),
  previous_mode text not null
    check (previous_mode in ('legacy', 'shadow', 'protected')),
  oracle_price numeric,
  oracle_price_time timestamptz,
  pool_long numeric not null,
  pool_short numeric not null,
  top_up_long numeric not null default 0,
  top_up_short numeric not null default 0,
  -- True when any position received b < c at activation (last-resort
  -- allocation). Once true, a downgrade to legacy is never a mode flip.
  reduced_any_basis boolean not null default false,
  -- Every position at the cutover mark: {userId, direction, size,
  -- costBasis, reserveBasisBefore, reserveBasisAfter}.
  position_snapshot jsonb not null,
  data jsonb,
  created_time timestamptz not null default now(),
  unique (contract_id, epoch)
);

alter table contract_perp_accounting_epochs enable row level security;

drop policy if exists "public read perp accounting epochs"
  on contract_perp_accounting_epochs;
create policy "public read perp accounting epochs"
  on contract_perp_accounting_epochs for select using (true);

create or replace function prevent_perp_accounting_epoch_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'PERP accounting epoch records are append-only (contract % epoch %)',
    old.contract_id, old.epoch;
end;
$$;

drop trigger if exists contract_perp_accounting_epochs_immutable
  on contract_perp_accounting_epochs;
create trigger contract_perp_accounting_epochs_immutable
before update or delete on contract_perp_accounting_epochs
for each row execute function prevent_perp_accounting_epoch_mutation();

-- ---------------------------------------------------------------------
-- 5. The writer guard
-- ---------------------------------------------------------------------
create or replace function perp_accounting_guard()
returns trigger
language plpgsql
as $$
declare
  v_contract_id text;
  v_mode text;
  v_epoch bigint;
  v_presented text;
begin
  -- A perp row is never re-keyed to another contract: that would move a
  -- protected position or its history out from under its contract's guard.
  if tg_op = 'UPDATE' and new.contract_id is distinct from old.contract_id then
    raise exception 'PERP accounting guard: % rows are never re-keyed to another contract (% -> %)',
      tg_table_name, old.contract_id, new.contract_id;
  end if;
  v_contract_id := case when tg_op = 'DELETE' then old.contract_id else new.contract_id end;

  select
    coalesce(c.data->>'perpAccountingMode', 'legacy'),
    coalesce((c.data->>'perpAccountingEpoch')::bigint, 0)
  into v_mode, v_epoch
  from contracts c
  where c.id = v_contract_id;

  -- A position or event for a contract row that does not exist is already
  -- corrupt; treat it as legacy so this guard never hides that failure
  -- behind its own.
  v_mode := coalesce(v_mode, 'legacy');
  v_epoch := coalesce(v_epoch, 0);

  if v_mode not in ('legacy', 'shadow', 'protected') then
    raise exception 'PERP accounting guard: contract % has unknown accounting mode %',
      v_contract_id, v_mode;
  end if;

  if v_mode = 'protected' then
    v_presented := nullif(current_setting('perp.accounting_epoch', true), '');
    if v_presented is null or v_presented <> v_epoch::text then
      raise exception 'PERP accounting guard: contract % is protected at epoch % but this transaction presented epoch %; refusing to % %',
        v_contract_id, v_epoch, coalesce(v_presented, 'none'), tg_op, tg_table_name;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    if new.accounting_epoch is distinct from v_epoch then
      raise exception 'PERP accounting guard: contract % row stamped epoch % but the contract is at epoch %',
        v_contract_id, new.accounting_epoch, v_epoch;
    end if;
    if tg_table_name = 'contract_perp_positions' then
      if new.reserve_basis is null then
        raise exception 'PERP accounting guard: protected position rows must carry reserve_basis (contract %)',
          v_contract_id;
      end if;
    elsif tg_table_name = 'contract_perp_events' then
      if new.accounting_mode <> 'protected' then
        raise exception 'PERP accounting guard: events on protected contract % must be stamped protected, got %',
          v_contract_id, new.accounting_mode;
      end if;
    end if;
    return new;
  end if;

  -- legacy / shadow: the mirror rule, enforced here so a pre-column writer
  -- produces exactly what a version-aware one would.
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_table_name = 'contract_perp_positions' then
    new.reserve_basis := new.cost_basis;
    new.accounting_epoch := v_epoch;
  elsif tg_table_name = 'contract_perp_events' then
    if new.event_type = 'basis-settlement' then
      raise exception 'PERP accounting guard: basis-settlement events exist only under protected accounting (contract % is %)',
        v_contract_id, v_mode;
    end if;
    new.reserve_basis_delta := new.cost_basis_delta;
    new.accounting_mode := v_mode;
    new.accounting_epoch := v_epoch;
  elsif tg_table_name = 'contract_perp_funding_events' then
    new.accounting_epoch := v_epoch;
  end if;
  return new;
end;
$$;

drop trigger if exists contract_perp_positions_accounting_guard
  on contract_perp_positions;
create trigger contract_perp_positions_accounting_guard
before insert or update or delete on contract_perp_positions
for each row execute function perp_accounting_guard();

-- Update/delete on events are already refused by contract_perp_events_immutable.
drop trigger if exists contract_perp_events_accounting_guard
  on contract_perp_events;
create trigger contract_perp_events_accounting_guard
before insert on contract_perp_events
for each row execute function perp_accounting_guard();

drop trigger if exists contract_perp_funding_events_accounting_guard
  on contract_perp_funding_events;
create trigger contract_perp_funding_events_accounting_guard
before insert on contract_perp_funding_events
for each row execute function perp_accounting_guard();

-- ---------------------------------------------------------------------
-- 6. The contract row: mode/epoch transitions and protected pool changes
-- ---------------------------------------------------------------------
-- Two rules, one trigger, evaluated only when one of the keys it cares
-- about actually changes:
--
--  a) A blind flip of perpAccountingMode/Epoch (a hand edit, a stale admin
--     tool) must not be possible: the transition must be made by the
--     migration tooling, which sets perp.accounting_transition in the same
--     transaction, and every transition must advance the epoch and have its
--     immutable record already written.
--  b) The financial contract fields of a protected contract (before OR
--     after this update) — poolLong/poolShort, the oracle mark and its
--     timestamps, and the solvency-halt fields — may only change in a
--     transaction that presented the contract's epoch, the one the row holds
--     after the update. Without this a pre-protected scheduler could commit
--     a legacy cross-side transfer through its price-only fast path, or a
--     price-only write for a tick on which protected accounting would have
--     settled a position, leaving an unhalted protected-invalid book that
--     the version-aware scheduler then skips as a duplicate point.
create or replace function perp_accounting_contract_guard()
returns trigger
language plpgsql
as $$
declare
  v_old_epoch bigint;
  v_new_epoch bigint;
  v_old_mode text;
  v_new_mode text;
  v_presented text;
begin
  v_old_epoch := coalesce((old.data->>'perpAccountingEpoch')::bigint, 0);
  v_new_epoch := coalesce((new.data->>'perpAccountingEpoch')::bigint, 0);
  v_old_mode := coalesce(old.data->>'perpAccountingMode', 'legacy');
  v_new_mode := coalesce(new.data->>'perpAccountingMode', 'legacy');

  if v_old_mode is distinct from v_new_mode or v_old_epoch <> v_new_epoch then
    if coalesce(current_setting('perp.accounting_transition', true), '') <> 'true' then
      raise exception 'PERP accounting guard: contract % accounting mode/epoch may only change through the guarded migration path',
        new.id;
    end if;
    if v_new_mode not in ('legacy', 'shadow', 'protected') then
      raise exception 'PERP accounting guard: contract % cannot enter unknown accounting mode %',
        new.id, v_new_mode;
    end if;
    if v_new_epoch <> v_old_epoch + 1 then
      raise exception 'PERP accounting guard: contract % accounting epoch must advance by exactly one (% -> %)',
        new.id, v_old_epoch, v_new_epoch;
    end if;
    if not exists (
      select 1 from contract_perp_accounting_epochs e
      where e.contract_id = new.id and e.epoch = v_new_epoch
        and e.accounting_mode = v_new_mode
        and e.previous_mode = v_old_mode
    ) then
      raise exception 'PERP accounting guard: contract % epoch % has no immutable activation record for % -> %',
        new.id, v_new_epoch, v_old_mode, v_new_mode;
    end if;
  end if;

  if (v_old_mode = 'protected' or v_new_mode = 'protected')
     and (
       (old.data->>'poolLong') is distinct from (new.data->>'poolLong')
       or (old.data->>'poolShort') is distinct from (new.data->>'poolShort')
       or (old.data->>'oraclePrice') is distinct from (new.data->>'oraclePrice')
       or (old.data->>'oraclePriceTime') is distinct from (new.data->>'oraclePriceTime')
       or (old.data->>'oracleSourceTime') is distinct from (new.data->>'oracleSourceTime')
       or (old.data->>'solvencyHaltTime') is distinct from (new.data->>'solvencyHaltTime')
       or (old.data->>'solvencyHaltReason') is distinct from (new.data->>'solvencyHaltReason')
     ) then
    v_presented := nullif(current_setting('perp.accounting_epoch', true), '');
    if v_presented is null or v_presented <> v_new_epoch::text then
      raise exception 'PERP accounting guard: contract % is protected at epoch % but this transaction presented epoch %; refusing to change its pools, mark or halt',
        new.id, v_new_epoch, coalesce(v_presented, 'none');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_perp_accounting_transition_guard on contracts;
drop trigger if exists contracts_perp_accounting_contract_guard on contracts;
create trigger contracts_perp_accounting_contract_guard
before update of data on contracts
for each row
when (
  (old.data->>'perpAccountingMode') is distinct from (new.data->>'perpAccountingMode')
  or (old.data->>'perpAccountingEpoch') is distinct from (new.data->>'perpAccountingEpoch')
  or (
    (
      (old.data->>'perpAccountingMode') = 'protected'
      or (new.data->>'perpAccountingMode') = 'protected'
    )
    and (
      (old.data->>'poolLong') is distinct from (new.data->>'poolLong')
      or (old.data->>'poolShort') is distinct from (new.data->>'poolShort')
      or (old.data->>'oraclePrice') is distinct from (new.data->>'oraclePrice')
      or (old.data->>'oraclePriceTime') is distinct from (new.data->>'oraclePriceTime')
      or (old.data->>'oracleSourceTime') is distinct from (new.data->>'oracleSourceTime')
      or (old.data->>'solvencyHaltTime') is distinct from (new.data->>'solvencyHaltTime')
      or (old.data->>'solvencyHaltReason') is distinct from (new.data->>'solvencyHaltReason')
    )
  )
)
execute function perp_accounting_contract_guard();

-- ---------------------------------------------------------------------
-- 7. Isolated shadow state (diagnostics only; no trigger, no financial row)
-- ---------------------------------------------------------------------
-- Accounting shadow: a forward checkpoint of the protected-basis state a
-- contract WOULD have, advanced by every live transition while the ledger
-- stays legacy. Never read by any payout path; never writes hypothetical b
-- into contract_perp_positions.
create table if not exists contract_perp_shadow_checkpoints (
  contract_id text primary key,
  accounting_epoch bigint not null default 0,
  state jsonb not null,
  transitions bigint not null default 0,
  divergences bigint not null default 0,
  last_report jsonb,
  updated_time timestamptz not null default now()
);
alter table contract_perp_shadow_checkpoints enable row level security;

-- Risk-policy shadow (Workstream B): the latest candidate-policy evaluation
-- per contract, kept OUT of the append-only financial event log.
create table if not exists contract_perp_risk_shadow (
  contract_id text primary key,
  data jsonb not null,
  updated_time timestamptz not null default now()
);
alter table contract_perp_risk_shadow enable row level security;

commit;
