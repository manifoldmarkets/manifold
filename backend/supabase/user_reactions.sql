create table if not exists
  user_reactions (
    user_id text not null,
    reaction_id text not null default random_alphanumeric (12),
    content_id text not null,
    content_type text not null,
    content_owner_id text not null,
    created_time timestamptz not null default now(),
    primary key (user_id, reaction_id)
  );

alter table user_reactions enable row level security;

drop policy if exists "public read" on user_reactions;

create policy "public read" on user_reactions for
select
  using (true);

create index if not exists user_reactions_content_id_raw on user_reactions (content_id);
