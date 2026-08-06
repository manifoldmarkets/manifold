begin;

-- `ts` is an event's effective oracle/source time. Delayed oracle publication
-- means it is not always the time the transition was actually applied.
alter table contract_perp_events
  add column if not exists applied_ts timestamptz;

-- Existing DEV history has no independent application timestamp. `ts` is the
-- only defensible backfill; launch markets are recreated after this migration
-- so their event accounting has reliable timestamps from inception.
update contract_perp_events
set applied_ts = ts
where applied_ts is null;

alter table contract_perp_events
  alter column applied_ts set default statement_timestamp(),
  alter column applied_ts set not null;

comment on column contract_perp_events.applied_ts is
  'Manifold application time; canonical for accounting periods and event order';

create index if not exists contract_perp_events_user_contract_applied
  on contract_perp_events (user_id, contract_id, applied_ts desc, id desc)
  where user_id is not null;

-- The nightly period job first discovers recent PERP contracts globally, so
-- that access path must lead with time rather than user.
create index if not exists contract_perp_events_recent_applied
  on contract_perp_events (applied_ts desc)
  include (contract_id, user_id)
  where user_id is not null;

-- Lifetime metric totals never consume hourly funding rows. Keep their lookup
-- bounded by actual user actions and terminal risk events as histories age.
create index if not exists contract_perp_events_user_contract_lifetime
  on contract_perp_events (user_id, contract_id, id desc)
  where user_id is not null
    and event_type <> 'funding';

-- Period P&L now derives from this log, so enforce the append-only contract at
-- the database boundary rather than relying on writer convention.
create or replace function prevent_perp_event_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return old;
  end if;
  raise exception 'PERP events are append-only (event %)', old.id;
end;
$$;

drop trigger if exists contract_perp_events_immutable
  on contract_perp_events;
create trigger contract_perp_events_immutable
before update or delete on contract_perp_events
for each row execute function prevent_perp_event_mutation();

-- A provider's effective/source timestamp can predate its availability by an
-- hour or more (NESO finalizes blocks late and in batches). Record immutable
-- publication time so historical marks never use data that was not yet known.
drop trigger if exists oracle_prices_no_update on oracle_prices;

alter table oracle_prices
  add column if not exists published_at timestamptz;

update oracle_prices
set published_at = ts
where published_at is null;

alter table oracle_prices
  alter column published_at set default statement_timestamp(),
  alter column published_at set not null;

comment on column oracle_prices.published_at is
  'When Manifold first persisted this immutable point; use for availability cutoffs';

create index if not exists oracle_prices_feed_published
  on oracle_prices (feed_id, published_at desc, ts desc);

create or replace function prevent_oracle_price_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.feed_id = old.feed_id
     and new.ts = old.ts
     and new.price is not distinct from old.price
     and new.source_ts is not distinct from old.source_ts
     and new.published_at is not distinct from old.published_at then
    return old;
  end if;
  raise exception 'oracle price points are append-only (% at %)', old.feed_id, old.ts;
end;
$$;

create trigger oracle_prices_no_update
before update or delete on oracle_prices
for each row execute function prevent_oracle_price_update();

commit;
