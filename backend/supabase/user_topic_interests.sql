create table if not exists
    user_topic_interests (
       id bigint generated always as identity primary key,
       user_id text not null,
       created_time timestamptz not null default now(),
       group_ids_to_activity jsonb not null
);

alter table user_topic_interests enable row level security;

create index if not exists user_topic_interests_created_time on user_topic_interests (user_id, created_time desc);


