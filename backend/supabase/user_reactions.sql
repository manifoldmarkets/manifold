
create table if not exists
    user_reactions (
                       user_id text not null,
                       reaction_id text not null,
                       data jsonb not null,
                       fs_updated_time timestamp not null,
                       primary key (user_id, reaction_id)
);

alter table user_reactions enable row level security;

drop policy if exists "public read" on user_reactions;

create policy "public read" on user_reactions for
    select
    using (true);

create index if not exists user_reactions_data_gin on user_reactions using GIN (data);

-- useful for getting just 'likes', we may want to index contentType as well
create index if not exists user_reactions_type on user_reactions (user_id, (to_jsonb(data) ->> 'type') desc);

-- useful for getting all reactions for a given contentId recently
create index if not exists user_reactions_content_id on user_reactions (
                                                                        (to_jsonb(data) ->> 'contentId'),
                                                                        (to_jsonb(data) ->> 'createdTime') desc
    );

alter table user_reactions
    cluster on user_reactions_type;
