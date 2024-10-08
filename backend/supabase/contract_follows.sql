-- This file is autogenerated from regen-schema.ts
create table if not exists
  contract_follows (
    contract_id text not null,
    created_time timestamp with time zone default now() not null,
    follow_id text not null,
    constraint primary key (contract_id, follow_id)
  );

-- Row Level Security
alter table contract_follows enable row level security;

-- Policies
drop policy if exists "public read" on contract_follows;

create policy "public read" on contract_follows for
select
  using (true);

-- Indexes
drop index if exists contract_follows_idx;

create index contract_follows_idx on public.contract_follows using btree (follow_id);

drop index if exists contract_follows_pkey;

create unique index contract_follows_pkey on public.contract_follows using btree (contract_id, follow_id);
