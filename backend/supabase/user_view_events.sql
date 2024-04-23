create table if not exists
    user_view_events (
                    id bigint generated always as identity primary key,
                    created_time timestamptz not null default now(),
                    name text not null, -- 'page', 'card', 'promoted'
                    user_id text not null,
                    contract_id text null,
                    comment_id text null,
                    ad_id text null
);

alter table user_view_events enable row level security;

create index user_view_events_name_contract_id_user_id on user_view_events (user_id, contract_id, name);

create index user_view_events_user_id_created_time on user_view_events (user_id, created_time desc);
