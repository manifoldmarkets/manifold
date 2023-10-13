-- CHANNELS
create table if not exists
    private_user_message_channels (
                              id bigint generated always as identity primary key,
                              created_time timestamptz not null default now(),
                              last_updated_time timestamptz not null default now()
);

alter table private_user_message_channels enable row level security;

drop policy if exists "public read" on private_user_message_channels;
create policy  "public read" on private_user_message_channels using (true);

-- CHANNEL MEMBERS
create table if not exists
    private_user_message_channel_members (
                                     id bigint generated always as identity primary key,
                                     created_time timestamptz not null default now(),
                                     channel_id bigint not null, -- channel_id is the same as private_user_messages.channel_id
                                     user_id text not null,
                                     role text not null default 'member', -- member, creator
                                     status text not null default 'proposed' -- proposed, joined, left, banned
);

alter table private_user_message_channel_members enable row level security;

drop policy if exists "self read" on private_user_message_channel_members;
create policy "self read" on private_user_message_channel_members
    using (user_id = firebase_uid());

-- SECURITY
create
    or replace function can_access_private_messages (channel_id bigint, user_id text)
    returns boolean parallel safe language sql as $$
select exists (
    select 1 from private_user_message_channel_members
    where private_user_message_channel_members.channel_id = $1
      and private_user_message_channel_members.user_id = $2
)
$$;

-- ENABLE SECURITY ON CHANNEL MEMBERS
drop policy if exists "private read" on private_user_message_channel_members;
create policy "private read" on private_user_message_channel_members
    using (firebase_uid() is not null and can_access_private_messages(channel_id, firebase_uid()));


-- MESSAGES
create table if not exists
    private_user_messages (
                      id bigint generated always as identity primary key,
                      channel_id bigint not null,
                      user_id text not null,
                      content jsonb not null,
                      created_time timestamptz not null default now()
);

alter table private_user_messages enable row level security;

drop policy if exists "private read" on private_user_messages;

create policy "private read" on private_user_messages
    using (firebase_uid() is not null and can_access_private_messages(channel_id, firebase_uid()));

create index if not exists private_user_messages_channel_id_idx
    on private_user_messages (channel_id, created_time desc);

alter table private_user_messages
    cluster on private_user_messages_channel_id_idx;

-- USER SEEN MESSAGES
create table if not exists
    private_user_seen_message_channels (
                        id bigint generated always as identity primary key,
                        user_id text not null,
                        channel_id bigint not null,
                        created_time timestamptz not null default now()
);

alter table private_user_seen_message_channels enable row level security;

drop policy if exists "private member read" on private_user_seen_message_channels;

create policy "private member read" on private_user_seen_message_channels using
    (firebase_uid() is not null and can_access_private_messages(channel_id, firebase_uid()));

drop policy if exists "private member insert" on private_user_seen_message_channels;

create policy "private member insert" on private_user_seen_message_channels for insert with check
    (firebase_uid() is not null and can_access_private_messages(channel_id, firebase_uid()));

create index if not exists user_seen_private_messages_created_time_desc_idx
    on private_user_seen_message_channels (user_id, channel_id, created_time desc);

alter table private_user_seen_message_channels
    cluster on user_seen_private_messages_created_time_desc_idx;
