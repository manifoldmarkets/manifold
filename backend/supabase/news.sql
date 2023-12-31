
create table if not exists
    news (
             id serial primary key,
             created_time timestamp not null default now(),
             title text not null,
             url text not null,
             published_time timestamp not null,
             author text,
             description text,
             image_url text,
             source_id text,
             source_name text,
             title_embedding vector (1536) not null,
    -- A news row should have contract_ids and/or group_ids
             contract_ids text[] null,
             group_ids text[] null
);

alter table news enable row level security;

drop policy if exists "public read" on news;

create policy "public read" on news for
    select
    using (true);
