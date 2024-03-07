
create table if not exists
    chat_messages (
                      id serial primary key,
                      user_id text not null,
                      channel_id text not null,
                      content jsonb not null,
                      created_time timestamptz not null default now()
);

alter table chat_messages enable row level security;

drop policy if exists "public read" on chat_messages;

create policy "public read" on chat_messages for
    select
    using (true);
create index if not exists chat_messages_channel_id
    on chat_messages (channel_id, id desc);

alter table chat_messages
    cluster on chat_messages_channel_id;

alter publication supabase_realtime
    add table chat_messages;

