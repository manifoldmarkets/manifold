create table
  user_monitor_status (
    id bigint primary key generated always as identity,
    user_id text not null references users (id),
    data JSONB not null,
    created_time TIMESTAMPTZ default now()
  );

-- Enable row-level security
alter table user_monitor_status enable row level security;

create index idx_user_monitor_status_user_id on user_monitor_status (user_id);
