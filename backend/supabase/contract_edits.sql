create table if not exists
    contract_edits (
                       id serial primary key,
                       contract_id text not null,
                       editor_id text not null,
                       data jsonb not null,
                       idempotency_key text, -- if created from a db trigger
                       updated_keys text[],
                       created_time timestamptz not null default now()
);

alter table contract_edits enable row level security;

drop policy if exists "public read" on contract_edits;

create policy "public read" on contract_edits for
    select
    using (true);

create index if not exists contract_edits_contract_id_idx on contract_edits (contract_id);
