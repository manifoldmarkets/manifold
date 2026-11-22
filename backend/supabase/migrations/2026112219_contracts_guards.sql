-- Install before 2026112220. Live bets and journal images are classified
-- by their market id and token, including after a bet has been deleted.
begin;

set local lock_timeout = '5s';

-- A historical bet can name a missing market. Giving that id a market later
-- would change how the backfill classifies the bet, even after its deletion.
-- The bet triggers in 2026112220 require a visible market for new references.
create or replace function contracts_check_insert () returns trigger language plpgsql as $$
declare
  id_in_use boolean;
begin
  select exists (select 1 from public.contract_bets where contract_id = new.id) into id_in_use;
  -- The journal is installed by 2026112220. Look it up only while it exists.
  if not id_in_use and to_regclass('public.user_stats_bet_journal') is not null then
    execute 'select exists (select 1 from public.user_stats_bet_journal where contract_id = $1)'
      into id_in_use using new.id;
  end if;
  if id_in_use then
    raise exception 'bets already name market id %; use another id', new.id;
  end if;
  return new;
end
$$;

create or replace trigger contracts_check_insert
before insert on contracts
for each row execute function contracts_check_insert ();

create or replace function contracts_token_fixed () returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id or new.token is distinct from old.token then
    raise exception 'contracts.id and contracts.token cannot change (dev-docs/user-stats.md)';
  end if;
  return new;
end
$$;

create or replace trigger contracts_token_fixed
before update of id, token on contracts
for each row execute function contracts_token_fixed ();

-- delete-market soft-deletes. Keeping every market also prevents its id
-- from being reused for a market with a different token.
create or replace function contracts_check_delete () returns trigger language plpgsql as $$
begin
  raise exception 'cannot remove markets: soft-delete the market instead';
end
$$;

create or replace trigger contracts_check_delete
before delete on contracts
for each row execute function contracts_check_delete ();

create or replace trigger contracts_check_truncate
before truncate on contracts
for each statement execute function contracts_check_delete ();

commit;
