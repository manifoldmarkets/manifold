
create table if not exists
    group_embeddings (
                         group_id text not null primary key,
                         created_time timestamp not null default now(),
                         embedding vector (1536) not null
);

alter table group_embeddings enable row level security;

drop policy if exists "public read" on group_embeddings;

create policy "public read" on group_embeddings for
    select
    using (true);

drop policy if exists "admin write access" on group_embeddings;

create policy "admin write access" on group_embeddings as PERMISSIVE for all to service_role;
