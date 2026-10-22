begin;

-- Some providers publish a dataset-level "as of" time that is distinct from
-- Manifold's observation timestamp. Preserve it on the immutable oracle row
-- so attribution never substitutes ingestion time for source data time.
alter table oracle_prices
  add column if not exists source_ts timestamptz;

comment on column oracle_prices.source_ts is
  'Provider-declared source dataset timestamp; distinct from Manifold observation ts';

create or replace function prevent_oracle_price_update()
returns trigger
language plpgsql
as $$
begin
  -- Permit an old writer's idempotent ON CONFLICT DO UPDATE during a rolling
  -- deploy, but reject changes to either the price or its source metadata.
  if new.feed_id = old.feed_id
     and new.ts = old.ts
     and new.price is not distinct from old.price
     and new.source_ts is not distinct from old.source_ts then
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
