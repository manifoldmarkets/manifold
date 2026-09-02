-- Database-level test for the protected-basis accounting guard installed by
-- backend/supabase/migrations/2026090201_perp_protected_basis.sql.
--
-- Runs inside one transaction against a scratch database that has the perp
-- tables and the migration applied (see perps-launch-runbook.md, "Protected
-- accounting"), and ROLLS BACK at the end. It never touches real data. Every
-- `raise exception` below is a failing assertion; a clean run prints
-- "perp accounting guard test: PASS".
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/sql/perp-accounting-guard-test.sql

begin;

create temp table guard_test_log (line text);

-- ---------------------------------------------------------------------
-- fixtures: one legacy contract, one protected contract at epoch 2
-- ---------------------------------------------------------------------
insert into contracts (id, data)
values
  ('guardtest-legacy', '{"mechanism":"perp","outcomeType":"PERP"}'::jsonb),
  ('guardtest-protected', '{"mechanism":"perp","outcomeType":"PERP"}'::jsonb);

-- The protected fixture must be activated through the guarded path: an
-- immutable epoch record first, then the contract flip with the transition
-- GUC set. Without the GUC the flip is refused.
insert into contract_perp_accounting_epochs
  (contract_id, epoch, accounting_mode, previous_mode, pool_long, pool_short, position_snapshot)
values ('guardtest-protected', 2, 'protected', 'shadow', 0, 0, '[]'::jsonb);

do $$
begin
  begin
    update contracts
    set data = data || '{"perpAccountingMode":"protected","perpAccountingEpoch":2}'::jsonb
    where id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: blind accounting-mode flip was accepted';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract % accounting mode/epoch may only change%' then
      raise;
    end if;
  end;
end $$;

select set_config('perp.accounting_transition', 'true', true);
update contracts
set data = data || '{"perpAccountingMode":"protected","perpAccountingEpoch":2}'::jsonb
where id = 'guardtest-protected';
select set_config('perp.accounting_transition', '', true);

-- ---------------------------------------------------------------------
-- 1. legacy contract: an old writer that never heard of reserve_basis
--    gets the mirror b = c, Δb = Δc, and the current epoch stamp.
-- ---------------------------------------------------------------------
insert into contract_perp_positions
  (contract_id, user_id, direction, size, cost_basis, original_cost_basis, entry_price, leverage, liquidation_price)
values ('guardtest-legacy', 'u1', 'long', 1000, 100, 100, 50, 10, 45);

insert into contract_perp_events
  (contract_id, user_id, event_type, oracle_price, size_delta, cost_basis_delta, original_cost_basis_delta, direction, leverage)
values ('guardtest-legacy', 'u1', 'open', 50, 1000, 100, 100, 'long', 10);

do $$
declare
  v_reserve numeric;
  v_epoch bigint;
  v_delta numeric;
  v_mode text;
begin
  select reserve_basis, accounting_epoch into v_reserve, v_epoch
  from contract_perp_positions where contract_id = 'guardtest-legacy';
  if v_reserve is distinct from 100 or v_epoch <> 0 then
    raise exception 'ASSERTION FAILED: legacy position not mirrored (reserve=%, epoch=%)', v_reserve, v_epoch;
  end if;
  select reserve_basis_delta, accounting_mode into v_delta, v_mode
  from contract_perp_events where contract_id = 'guardtest-legacy';
  if v_delta <> 100 or v_mode <> 'legacy' then
    raise exception 'ASSERTION FAILED: legacy event not mirrored (delta=%, mode=%)', v_delta, v_mode;
  end if;
  -- A legacy writer cannot sneak in a smaller b: the mirror overrides it.
  update contract_perp_positions set reserve_basis = 10 where contract_id = 'guardtest-legacy';
  select reserve_basis into v_reserve from contract_perp_positions where contract_id = 'guardtest-legacy';
  if v_reserve <> 100 then
    raise exception 'ASSERTION FAILED: legacy mirror did not override reserve_basis (got %)', v_reserve;
  end if;
  -- basis-settlement events are protected-only.
  begin
    insert into contract_perp_events (contract_id, user_id, event_type, direction)
    values ('guardtest-legacy', 'u1', 'basis-settlement', 'long');
    raise exception 'ASSERTION FAILED: legacy contract accepted a basis-settlement event';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: basis-settlement events exist only under protected accounting%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 2. protected contract: the literal old-writer fixture. No GUC, no
--    reserve_basis, no stamps — exactly what a pre-protected binary emits.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into contract_perp_positions
      (contract_id, user_id, direction, size, cost_basis, original_cost_basis, entry_price, leverage, liquidation_price)
    values ('guardtest-protected', 'u1', 'long', 1000, 100, 100, 50, 10, 45);
    raise exception 'ASSERTION FAILED: old writer inserted a protected position';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected is protected at epoch 2 but this transaction presented epoch none%' then raise; end if;
  end;
  begin
    insert into contract_perp_events
      (contract_id, user_id, event_type, oracle_price, size_delta, cost_basis_delta, original_cost_basis_delta, direction, leverage)
    values ('guardtest-protected', 'u1', 'open', 50, 1000, 100, 100, 'long', 10);
    raise exception 'ASSERTION FAILED: old writer inserted a protected event';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected is protected%' then raise; end if;
  end;
  begin
    insert into contract_perp_funding_events
      (contract_id, ts, oracle_price, pool_long_before, pool_long_after, pool_short_before, pool_short_after, funding_rate)
    values ('guardtest-protected', now(), 50, 1, 1, 1, 1, 0);
    raise exception 'ASSERTION FAILED: old writer inserted a protected funding event';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected is protected%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 3. version-aware writer: presents the epoch, stamps rows, states b.
-- ---------------------------------------------------------------------
select set_config('perp.accounting_epoch', '2', true);

insert into contract_perp_positions
  (contract_id, user_id, direction, size, cost_basis, reserve_basis, accounting_epoch, original_cost_basis, entry_price, leverage, liquidation_price)
values ('guardtest-protected', 'u1', 'long', 1000, 100, 90, 2, 100, 50, 10, 45);

insert into contract_perp_events
  (contract_id, user_id, event_type, oracle_price, size_delta, cost_basis_delta, reserve_basis_delta, original_cost_basis_delta, direction, leverage, accounting_mode, accounting_epoch)
values ('guardtest-protected', 'u1', 'basis-settlement', 50, 0, 0, -10, 0, 'long', 10, 'protected', 2);

do $$
declare v_reserve numeric;
begin
  select reserve_basis into v_reserve from contract_perp_positions where contract_id = 'guardtest-protected';
  if v_reserve <> 90 then
    raise exception 'ASSERTION FAILED: protected reserve_basis was not persisted as sent (got %)', v_reserve;
  end if;
  -- Stale epoch stamp on the row, correct GUC: refused.
  begin
    update contract_perp_positions set accounting_epoch = 1 where contract_id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: stale row epoch accepted';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected row stamped epoch 1%' then raise; end if;
  end;
  -- Missing reserve_basis under protected accounting: refused.
  begin
    update contract_perp_positions set reserve_basis = null where contract_id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: null reserve_basis accepted on a protected row';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: protected position rows must carry reserve_basis%' then raise; end if;
  end;
  -- b above c: refused by the check constraint.
  begin
    update contract_perp_positions set reserve_basis = 101 where contract_id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: reserve_basis above cost_basis accepted';
  exception when check_violation then null;
  end;
  -- An event not stamped protected: refused.
  begin
    insert into contract_perp_events
      (contract_id, user_id, event_type, direction, accounting_mode, accounting_epoch)
    values ('guardtest-protected', 'u1', 'close', 'long', 'legacy', 2);
    raise exception 'ASSERTION FAILED: legacy-stamped event accepted on a protected contract';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: events on protected contract % must be stamped protected%' then raise; end if;
  end;
end $$;

-- A wrong epoch in the GUC (a version-aware writer with a STALE contract
-- snapshot, e.g. loaded before a re-activation) is refused too.
select set_config('perp.accounting_epoch', '1', true);
do $$
begin
  begin
    delete from contract_perp_positions where contract_id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: stale-epoch writer deleted a protected position';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected is protected at epoch 2 but this transaction presented epoch 1%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 4. epoch records are append-only; the transition guard needs one.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    update contract_perp_accounting_epochs set pool_long = 5 where contract_id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: epoch record was mutable';
  exception when others then
    if sqlerrm not like 'PERP accounting epoch records are append-only%' then raise; end if;
  end;
  perform set_config('perp.accounting_transition', 'true', true);
  begin
    update contracts set data = data || '{"perpAccountingEpoch":3}'::jsonb where id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: epoch advanced without an activation record';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract % epoch 3 has no immutable activation record%' then raise; end if;
  end;
  begin
    update contracts set data = data || '{"perpAccountingMode":"legacy","perpAccountingEpoch":2}'::jsonb where id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: non-advancing epoch accepted';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract % accounting epoch must advance%' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------
-- 5. contract-level pool changes on a protected contract (review P1-1):
--    the old scheduler's price-only fast path can carry a legacy cross-side
--    transfer. Pools may change only with the epoch presented; price-only
--    and halt patches, and legacy contracts, are untouched.
-- ---------------------------------------------------------------------
-- fixture pools, written by the version-aware path (epoch presented)
select set_config('perp.accounting_epoch', '2', true);
update contracts set data = data || '{"poolLong":50,"poolShort":100}'::jsonb where id = 'guardtest-protected';
select set_config('perp.accounting_epoch', '', true);
do $$
declare v_l numeric; v_s numeric;
begin
  begin
    -- exactly the stale scheduler's write: pools move, nothing else does
    update contracts set data = data || '{"poolLong":80,"poolShort":70,"oraclePrice":101}'::jsonb
     where id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: old writer moved protected pools through a contract-only patch';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected is protected at epoch 2 but this transaction presented epoch none; refusing to change its pools%' then raise; end if;
  end;
  select (data->>'poolLong')::numeric, (data->>'poolShort')::numeric into v_l, v_s from contracts where id = 'guardtest-protected';
  if v_l <> 50 or v_s <> 100 then
    raise exception 'ASSERTION FAILED: protected pools changed (%/%)', v_l, v_s;
  end if;
  -- price-only and halt patches are allowed (they move no mana)
  update contracts set data = data || '{"oraclePrice":101,"solvencyHaltTime":1,"solvencyHaltReason":"x"}'::jsonb where id = 'guardtest-protected';
  -- a stale epoch is refused too
  perform set_config('perp.accounting_epoch', '1', true);
  begin
    update contracts set data = data || '{"poolLong":80,"poolShort":70}'::jsonb where id = 'guardtest-protected';
    raise exception 'ASSERTION FAILED: stale-epoch writer moved protected pools';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-protected is protected at epoch 2 but this transaction presented epoch 1%' then raise; end if;
  end;
  -- the version-aware writer presents the epoch and may move pools
  perform set_config('perp.accounting_epoch', '2', true);
  update contracts set data = data || '{"poolLong":80,"poolShort":70}'::jsonb where id = 'guardtest-protected';
  select (data->>'poolLong')::numeric, (data->>'poolShort')::numeric into v_l, v_s from contracts where id = 'guardtest-protected';
  if v_l <> 80 or v_s <> 70 then
    raise exception 'ASSERTION FAILED: presented writer could not move protected pools';
  end if;
  perform set_config('perp.accounting_epoch', '', true);
  -- legacy contracts are not affected
  update contracts set data = data || '{"poolLong":80,"poolShort":70}'::jsonb where id = 'guardtest-legacy';
end $$;

-- ---------------------------------------------------------------------
-- 6. activation ordering: the flip that makes a contract protected may carry
--    a top-up in the same patch only if the NEW epoch was presented first.
-- ---------------------------------------------------------------------
insert into contracts (id, data) values ('guardtest-activating', '{"mechanism":"perp","outcomeType":"PERP","poolLong":10,"poolShort":10}'::jsonb);
insert into contract_perp_accounting_epochs
  (contract_id, epoch, accounting_mode, previous_mode, pool_long, pool_short, position_snapshot)
values ('guardtest-activating', 1, 'protected', 'legacy', 10, 10, '[]'::jsonb);
do $$
begin
  perform set_config('perp.accounting_transition', 'true', true);
  begin
    update contracts
       set data = data || '{"perpAccountingMode":"protected","perpAccountingEpoch":1,"poolLong":110,"poolShort":10}'::jsonb
     where id = 'guardtest-activating';
    raise exception 'ASSERTION FAILED: activation patch moved pools without presenting the new epoch';
  exception when others then
    if sqlerrm not like 'PERP accounting guard: contract guardtest-activating is protected at epoch 1 but this transaction presented epoch none%' then raise; end if;
  end;
  perform set_config('perp.accounting_epoch', '1', true);
  update contracts
     set data = data || '{"perpAccountingMode":"protected","perpAccountingEpoch":1,"poolLong":110,"poolShort":10}'::jsonb
   where id = 'guardtest-activating';
  perform set_config('perp.accounting_transition', '', true);
  perform set_config('perp.accounting_epoch', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 7. shadow tables carry no guard and no financial row
-- ---------------------------------------------------------------------
insert into contract_perp_shadow_checkpoints (contract_id, accounting_epoch, state)
values ('guardtest-legacy', 0, '{"pool":{"L":1,"S":1},"positions":[]}'::jsonb);
insert into contract_perp_risk_shadow (contract_id, data) values ('guardtest-protected', '{}'::jsonb);

select 'perp accounting guard test: PASS' as result;

rollback;
