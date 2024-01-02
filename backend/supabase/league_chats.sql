
create table if not exists
    league_chats (
                     id serial primary key,
                     channel_id text not null, -- link to chat_messages table
                     created_time timestamptz not null default now(),
                     season int not null, -- integer id of season, i.e. 1 for first season, 2 for second, etc.
                     division int not null, -- 1 (beginner) to 4 (expert)
                     cohort text not null, -- id of cohort (group of competing users). Unique across seasons.
                     owner_id text,
                     unique (season, division, cohort)
);

alter table league_chats enable row level security;

drop policy if exists "public read" on league_chats;

create policy "public read" on league_chats for
    select
    using (true);
