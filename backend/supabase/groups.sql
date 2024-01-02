
create table if not exists
    groups (
               id text not null primary key default uuid_generate_v4 (),
               data jsonb not null,
               fs_updated_time timestamp,
               privacy_status text,
               slug text not null,
               name text not null,
               name_fts tsvector generated always as (to_tsvector('english'::regconfig, name)) stored,
               creator_id text,
               total_members numeric default 0,
               importance_score numeric default 0
);

alter table groups enable row level security;

drop policy if exists "public read" on groups;

create policy "public read" on groups for
    select
    using (true);

alter table groups
    cluster on groups_pkey;
