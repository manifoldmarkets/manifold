-- Yap is independent of forum posts and legacy market reposts.
create table social_posts (
  id text primary key,
  user_id text not null references users(id),
  text text not null check (char_length(text) <= 2000),
  created_time timestamptz not null default clock_timestamp(),
  edited_time timestamptz,
  parent_id text references social_posts(id),
  root_id text not null references social_posts(id),
  source_contract_id text references contracts(id),
  source_comment_id text,
  source_bet_id text,
  deleted_time timestamptz,
  deleted_by text references users(id),
  removed_by_moderator boolean not null default false,
  check (parent_id is not null or root_id = id),
  check (parent_id is null or parent_id <> id)
);
create index social_posts_timeline on social_posts(created_time desc, id desc)
  where parent_id is null;
create index social_posts_replies on social_posts(parent_id, created_time, id);
create index social_posts_root on social_posts(root_id);
create index social_posts_author on social_posts(user_id, created_time desc);

create table social_post_markets (
  post_id text not null references social_posts(id) on delete cascade,
  contract_id text not null references contracts(id),
  position integer not null check (position >= 0 and position < 5),
  primary key(post_id, contract_id),
  unique(post_id, position)
);
create table social_write_limits (
  user_id text not null references users(id),
  action text not null,
  window_start timestamptz not null default now(),
  count integer not null default 1,
  primary key(user_id, action)
);
-- Public reads go through the API, which redacts deleted content, checks current
-- source/market visibility, and applies viewer blocking before pagination.
alter table social_posts enable row level security;
alter table social_post_markets enable row level security;
alter table social_write_limits enable row level security;
create unique index user_reactions_social_unique
  on user_reactions(user_id, content_id) where content_type = 'social_post';
create index user_reactions_social_likers
  on user_reactions(content_id, created_time, user_id) where content_type = 'social_post';
