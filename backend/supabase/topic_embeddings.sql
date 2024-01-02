
create table if not exists
    topic_embeddings (
                         topic text not null primary key,
                         created_at timestamp not null default now(),
                         embedding vector (1536) not null
);

alter table topic_embeddings enable row level security;

drop policy if exists "public read" on topic_embeddings;

create policy "public read" on topic_embeddings for
    select
    using (true);

drop policy if exists "admin write access" on topic_embeddings;

create policy "admin write access" on topic_embeddings as PERMISSIVE for all to service_role;
