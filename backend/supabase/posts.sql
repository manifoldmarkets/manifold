-- This file is autogenerated from regen-schema.ts
create table if not exists
  posts (
    bet_id text,
    contract_comment_id text,
    contract_id text,
    created_time timestamp with time zone default now() not null,
    id bigint primary key generated always as identity not null,
    user_avatar_url text not null,
    user_id text not null,
    user_name text not null,
    user_username text not null
  );

-- Row Level Security
alter table posts enable row level security;

-- Policies
drop policy if exists "public read" on posts;

create policy "public read" on posts for
select
  using (true);

-- Indexes
drop index if exists posts_pkey1;

create unique index posts_pkey1 on public.posts using btree (id);

drop index if exists reposts_contract;

create index reposts_contract on public.posts using btree (contract_id);

drop index if exists reposts_contract_comment;

create index reposts_contract_comment on public.posts using btree (contract_comment_id);

drop index if exists reposts_user;

create index reposts_user on public.posts using btree (user_id);
