create table if not exists
  dashboard_follows (
    dashboard_id text not null,
    follower_id text not null,
    created_time timestamptz default now(),
    primary key (dashboard_id, follower_id)
  );
