create table if not exists
    user_comment_view_events (
                    id bigint generated always as identity primary key,
                    created_time timestamptz not null default now(),
                    user_id text not null,
                    contract_id text not null,
                    comment_id text not null
);

alter table user_comment_view_events enable row level security;

create index user_comment_view_events_user_id_created_time on user_comment_view_events (user_id, created_time desc);
