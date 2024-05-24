
create table if not exists
    mana_supply_stats
(
    id               bigint generated always as identity primary key,
    created_time     timestamptz not null default now(),
    start_time       timestamptz not null,
    end_time         timestamptz not null,
    total_value      numeric     not null,
    balance          numeric     not null,
    spice_balance    numeric     not null,
    investment_value numeric     not null,
    loan_total       numeric     not null,
    amm_liquidity    numeric     not null
);

alter table mana_supply_stats enable row level security;
create policy "public read" on mana_supply_stats for
    select
    using (true);
