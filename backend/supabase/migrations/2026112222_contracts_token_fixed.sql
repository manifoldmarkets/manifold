-- A bet counts as a trade by its market's token when it is written
-- (user_stats, migration 2026112220). Nothing changes a market's token after
-- creation; this keeps it so. It fires only for an UPDATE that names token,
-- which no code does, so it costs nothing. Its own file, so retrying it never
-- reruns the user_stats install.
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

commit;
