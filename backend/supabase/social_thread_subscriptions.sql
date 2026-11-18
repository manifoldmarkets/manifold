-- Who follows a Yap thread, by its root post. Taking part subscribes; muting
-- keeps the row with muted set, so taking part again does not undo the mute.
create table if not exists social_thread_subscriptions (
  root_id text not null references social_posts(id),
  user_id text not null references users(id),
  muted boolean not null default false,
  created_time timestamptz not null default now(),
  primary key (root_id, user_id)
);

alter table social_thread_subscriptions enable row level security;
