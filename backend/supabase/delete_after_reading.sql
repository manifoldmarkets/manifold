create table
  delete_after_reading (
    id bigint primary key generated always as identity,
    created_time timestamp with time zone default now() not null,
    user_id text not null references users (id),
    data jsonb
  );

alter table delete_after_reading enable row level security;
