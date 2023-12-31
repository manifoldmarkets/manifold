
create table if not exists
    user_seen_chats (
                        id bigint generated always as identity primary key,
                        user_id text not null,
                        channel_id text not null,
                        created_time timestamptz not null default now()
);

alter table user_seen_chats enable row level security;

drop policy if exists "public read" on user_seen_chats;

create policy "public read" on user_seen_chats for
    select
    using (true);

drop policy if exists "user can insert" on user_seen_chats;

create policy "user can insert" on user_seen_chats for insert
    with
    check (true);

create index if not exists user_seen_chats_created_time_desc_idx
    on user_seen_chats (user_id, channel_id, created_time desc);

alter table user_seen_chats
    cluster on user_seen_chats_created_time_desc_idx;
