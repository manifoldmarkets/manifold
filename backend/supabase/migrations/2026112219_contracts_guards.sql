-- Install after the API and before 2026112220 starts counting bets. Both
-- the live counters and the backfill classify a bet by its market's token.
begin;

set local lock_timeout = '5s';

create or replace function contracts_token_fixed () returns trigger language plpgsql as $$
begin
  if new.token is distinct from old.token then
    raise exception 'contracts.token cannot change: user_stats counts trades by it (dev-docs/user-stats.md)';
  end if;
  return new;
end
$$;

create or replace trigger contracts_token_fixed
before update of token on contracts
for each row execute function contracts_token_fixed ();

-- delete-market soft-deletes, so only a direct hard delete pauses bet writes.
create or replace function contracts_check_delete () returns trigger language plpgsql volatile as $$
declare
  referenced boolean;
begin
  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'delete markets in read committed or serializable';
  end if;

  -- Wait for writers (which also write the journal) and keep new writers out
  -- through commit. In read committed, the next query in this volatile
  -- function sees bets committed during the wait. Repeatable read cannot.
  -- If both transactions are serializable, the reads of bets here and of
  -- the market in the bet trigger let PostgreSQL detect a serialization cycle.
  lock table contract_bets in share mode;
  select exists (select 1 from contract_bets where contract_id = old.id)
    into referenced;
  if not referenced and to_regclass('public.user_stats_bet_journal') is not null then
    -- The guards are live before the journal is created.
    execute 'select exists (select 1 from public.user_stats_bet_journal where contract_id = $1)'
      into referenced using old.id;
  end if;
  if referenced then
    raise exception 'contract % is referenced by bets: soft-delete the market instead', old.id;
  end if;
  return old;
end
$$;

create or replace trigger contracts_check_delete
before delete on contracts
for each row execute function contracts_check_delete ();

commit;
