
create table if not exists
    contract_liquidity (
                           contract_id text not null,
                           liquidity_id text not null,
                           data jsonb not null,
                           fs_updated_time timestamp not null,
                           primary key (contract_id, liquidity_id)
);

alter table contract_liquidity enable row level security;

drop policy if exists "public read" on contract_liquidity;

create policy "public read" on contract_liquidity for
    select
    using (true);

alter table contract_liquidity
    cluster on contract_liquidity_pkey;
