begin;

-- Oracle points become executable market prices. Rewriting a published point
-- would make the public chart disagree with liquidations, funding, and trades
-- that already used the original value. Corrections must be appended at a new
-- observation timestamp.
create or replace function prevent_oracle_price_update()
returns trigger
language plpgsql
as $$
begin
  -- Permit an old writer's idempotent ON CONFLICT DO UPDATE during a rolling
  -- deploy, but reject any attempt to change the published value.
  if new.feed_id = old.feed_id
     and new.ts = old.ts
     and new.price is not distinct from old.price then
    return old;
  end if;
  raise exception 'oracle price points are append-only (% at %)', old.feed_id, old.ts;
end;
$$;

drop trigger if exists oracle_prices_no_update on oracle_prices;
create trigger oracle_prices_no_update
before update on oracle_prices
for each row execute function prevent_oracle_price_update();

commit;
