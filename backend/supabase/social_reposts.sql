-- One re-Yap per person per post. Undoing sets active to false and keeps the
-- row, so the 24-hour bump cooldown survives an undo.
create table if not exists social_reposts (
  post_id text not null references social_posts(id),
  user_id text not null references users(id),
  active boolean not null default true,
  created_time timestamptz not null default now(),
  bumped_time timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists social_reposts_active_time on social_reposts(bumped_time desc, post_id)
  where active;

alter table social_reposts enable row level security;
