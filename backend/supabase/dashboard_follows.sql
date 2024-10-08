-- This file is autogenerated from regen-schema.ts
create table if not exists
  dashboard_follows (
    created_time timestamp with time zone default now(),
    dashboard_id text not null,
    follower_id text not null,
    constraint primary key (dashboard_id, follower_id)
  );

-- Indexes
drop index if exists dashboard_follows_pkey;

create unique index dashboard_follows_pkey on public.dashboard_follows using btree (dashboard_id, follower_id);

drop index if exists idx_dashboard_follows_follower_dashboard;

create index idx_dashboard_follows_follower_dashboard on public.dashboard_follows using btree (follower_id, dashboard_id);
