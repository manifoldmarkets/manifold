create table if not exists
  love_likes (
    creator_id text not null,
    target_id text not null,
    like_id text not null default random_alphanumeric(12),
    created_time timestamptz not null default now(),
    primary key (creator_id, like_id)
  );

alter table love_likes enable row level security;

drop policy if exists "public read" on love_likes;

create policy "public read" on love_likes for
select
  using (true);

create index if not exists user_likes_target_id_raw on love_likes (target_id);
