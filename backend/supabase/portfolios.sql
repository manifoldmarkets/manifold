
create table if not exists
    portfolios (
                   id text not null primary key,
                   creator_id text not null,
                   slug text not null,
                   name text not null,
                   items jsonb not null,
                   created_time timestamptz not null default now()
);

alter table portfolios enable row level security;

drop policy if exists "public read" on portfolios;

create policy "public read" on portfolios for
    select
    using (true);
