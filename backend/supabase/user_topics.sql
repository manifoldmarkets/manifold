
create table if not exists
    user_topics (
                    user_id text not null primary key,
                    created_at timestamp not null default now(),
                    topic_embedding vector (1536) not null,
                    topics text[] not null
);

alter table user_topics enable row level security;

drop policy if exists "public read" on user_topics;

create policy "public read" on user_topics for
    select
    using (true);

drop policy if exists "public write access" on user_topics;

create policy "public write access" on user_topics for all using (true);
