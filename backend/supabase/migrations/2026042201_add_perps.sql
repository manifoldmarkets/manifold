-- Add perpetual futures (ManiPerp AMM) storage.
-- Adds four tables: oracle_prices, contract_perp_positions,
-- contract_perp_events, contract_perp_funding_events.
-- No oracle_feeds registry — feed_id is free text.
begin;

-- Oracle price time series. Internal services write rows here; perps read
-- the latest row for their feed_id on each update.
create table if not exists
  oracle_prices (
    feed_id text not null,
    ts timestamptz not null,
    price numeric not null,
    primary key (feed_id, ts)
  );

create index if not exists oracle_prices_feed_ts_desc
  on oracle_prices (feed_id, ts desc);

-- Authoritative perp position state. One row per (user, contract, direction).
-- Partial unique index on (contract_id, user_id) enforces one-way mode
-- (drop the index to opt into hedge mode later).
create table if not exists
  contract_perp_positions (
    contract_id text not null,
    user_id text not null,
    direction text not null check (direction in ('long', 'short')),
    size numeric not null,
    cost_basis numeric not null,
    original_cost_basis numeric not null,
    entry_price numeric not null,
    leverage numeric not null,
    liquidation_price numeric not null,
    opened_time timestamptz not null default now(),
    updated_time timestamptz not null default now(),
    primary key (contract_id, user_id, direction)
  );

create index if not exists contract_perp_positions_contract_dir
  on contract_perp_positions (contract_id, direction);

create index if not exists contract_perp_positions_user
  on contract_perp_positions (user_id);

-- One-way mode enforcement at the DB layer: any given user may only hold a
-- single position per contract. Partial because `size = 0` rows shouldn't
-- exist (we delete closed positions), but defensive.
create unique index if not exists contract_perp_positions_one_way
  on contract_perp_positions (contract_id, user_id)
  where size > 0;

-- Event log for every perp state transition: open/add/close/liquidation/
-- adl/funding. Powers PnL derivation, profile surfaces, leagues, and audit.
create table if not exists
  contract_perp_events (
    id bigserial primary key,
    contract_id text not null,
    user_id text,
    event_type text not null
      check (event_type in ('open','add','close','liquidation','adl','funding')),
    ts timestamptz not null default now(),
    oracle_price numeric,
    size_delta numeric not null default 0,
    cost_basis_delta numeric not null default 0,
    original_cost_basis_delta numeric not null default 0,
    direction text,
    leverage numeric,
    data jsonb
  );

create index if not exists contract_perp_events_contract_ts
  on contract_perp_events (contract_id, ts desc);

create index if not exists contract_perp_events_user_ts
  on contract_perp_events (user_id, ts desc);

-- Funding event summaries. One row per contract per funding period. Powers
-- the funding-rate chart on the market page.
create table if not exists
  contract_perp_funding_events (
    contract_id text not null,
    ts timestamptz not null,
    oracle_price numeric not null,
    pool_long_before numeric not null,
    pool_long_after numeric not null,
    pool_short_before numeric not null,
    pool_short_after numeric not null,
    funding_rate numeric not null,
    num_liquidations int not null default 0,
    adl_factor_long numeric not null default 1,
    adl_factor_short numeric not null default 1,
    primary key (contract_id, ts)
  );

alter table oracle_prices enable row level security;
alter table contract_perp_positions enable row level security;
alter table contract_perp_events enable row level security;
alter table contract_perp_funding_events enable row level security;

drop policy if exists "public read oracle_prices" on oracle_prices;
create policy "public read oracle_prices" on oracle_prices for
select using (true);

drop policy if exists "public read perp positions" on contract_perp_positions;
create policy "public read perp positions" on contract_perp_positions for
select using (true);

drop policy if exists "public read perp events" on contract_perp_events;
create policy "public read perp events" on contract_perp_events for
select using (true);

drop policy if exists "public read perp funding" on contract_perp_funding_events;
create policy "public read perp funding" on contract_perp_funding_events for
select using (true);

commit;
