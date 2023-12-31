
create table if not exists
    contract_embeddings (
                            contract_id text not null primary key,
                            created_at timestamp not null default now(),
                            embedding vector (1536) not null
);

alter table contract_embeddings enable row level security;

drop policy if exists "public read" on contract_embeddings;

create policy "public read" on contract_embeddings for
    select
    using (true);

drop policy if exists "admin write access" on contract_embeddings;

create policy "admin write access" on contract_embeddings as PERMISSIVE for all to service_role;

set
    ivfflat.probes = 7;

create index if not exists contract_embeddings_embedding_dec_2023 on contract_embeddings using ivfflat (embedding vector_cosine_ops)
    with
    (lists = 500);
