create table if not exists
    user_contract_interactions (
       id bigint generated always as identity primary key,
       created_time timestamptz not null default now(),
       name text not null,
       user_id text not null,
       contract_id text not null,
       comment_id text null,
       bet_group_id text null,
       bet_id text null,
       feed_reasons text[] null,
       feed_type text null
);

alter table user_contract_interactions enable row level security;