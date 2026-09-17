create table social_posts (
  id text primary key,
  user_id text not null references users(id),
  text text not null check (char_length(text) <= 2000),
  created_time timestamptz not null default clock_timestamp(),
  edited_time timestamptz,
  image_urls text[] not null default '{}',
  constraint social_posts_image_limit check (cardinality(image_urls) <= 4),
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


alter table social_posts enable row level security;
