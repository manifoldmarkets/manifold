

create table if not exists
    contract_follows (
                         contract_id text not null,
                         follow_id text not null,
                         data jsonb not null,
                         fs_updated_time timestamp not null,
                         primary key (contract_id, follow_id)
);

create index if not exists contract_follows_idx on contract_follows (follow_id);

alter table contract_follows enable row level security;

drop policy if exists "public read" on contract_follows;
drop policy if exists "user can insert" on contract_follows;
drop policy if exists "user can delete" on contract_follows;

create policy "public read" on contract_follows for
    select
    using (true);
create policy "user can insert" on contract_follows for insert
    with check (firebase_uid() = follow_id);
create policy "user can delete" on contract_follows for delete
    using (firebase_uid() = follow_id);


alter table contract_follows
    cluster on contract_follows_pkey;
