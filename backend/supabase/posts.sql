create table if not exists
    posts (
    id bigint generated always as identity primary key,
    created_time timestamptz not null default now(),
    user_id text not null,
    user_name text not null,
    user_username text not null,
    user_avatar_url text not null,
    contract_id text null,
    contract_comment_id text null
);

alter table posts enable row level security;

drop policy if exists "public read" on posts;

create policy "public read" on posts for
    select
    using (true);
create index if not exists reposts_user on posts (user_id);
create index if not exists reposts_contract on posts (contract_id);
create index if not exists reposts_contract_comment on posts (contract_comment_id);