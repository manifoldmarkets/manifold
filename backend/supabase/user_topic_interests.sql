create table if not exists
    user_topic_interests (
       id bigint generated always as identity primary key,
       created_time timestamptz not null default now(),
       user_id text not null,
       topic_ids_to_interest jsonb not null
);

alter table user_topic_interests enable row level security;
