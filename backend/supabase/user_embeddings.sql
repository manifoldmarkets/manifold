
create table if not exists
    user_embeddings (
                        user_id text not null primary key,
                        created_at timestamp not null default now(),
                        interest_embedding vector (1536) not null,
                        contract_view_embedding vector (1536),
                        disinterest_embedding vector (1536)
);

alter table user_embeddings enable row level security;

drop policy if exists "public read" on user_embeddings;

create policy "public read" on user_embeddings for
    select
    using (true);

drop policy if exists "admin write access" on user_embeddings;

create policy "admin write access" on user_embeddings as PERMISSIVE for all to service_role;

create index if not exists user_embeddings_interest_embedding on user_embeddings using ivfflat (interest_embedding vector_cosine_ops)
    with
    (lists = 500);
