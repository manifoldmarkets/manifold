
create table if not exists
    user_share_events (
                          id bigint generated always as identity primary key,
                          created_time timestamptz not null default now(),
                          user_id text not null,
                          contract_id text null,
                          comment_id text null
);

alter table user_share_events enable row level security;

drop policy if exists "public read" on user_share_events;

create policy "public read" on user_share_events for
    select
    using (true);

create index if not exists user_share_events_user_id on user_share_events (user_id);

alter table user_share_events
    cluster on user_share_events_user_id;
