create table social_write_limits (
  user_id text not null references users(id),
  action text not null,
  window_start timestamptz not null default now(),
  count integer not null default 1,
  primary key(user_id, action)
);

alter table social_write_limits enable row level security;
