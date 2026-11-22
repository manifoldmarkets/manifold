-- Install before 2026112220. Live bets and journal images are classified
-- by their market id and token, including after a bet has been deleted.
begin;

set local lock_timeout = '5s';

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
