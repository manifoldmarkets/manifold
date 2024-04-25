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

create index user_contract_interactions_name_contract_id_user_id on user_contract_interactions (name, contract_id, user_id);

create index user_contract_interactions_user_id_created_time on user_contract_interactions (user_id, created_time desc);