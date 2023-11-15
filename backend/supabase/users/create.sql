create table if not exists
  users (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null,
    name text not null,
    created_time timestamptz,
    username text not null,
    name_username_vector tsvector generated always as (to_tsvector('english', name || ' ' || username)) stored
  );

alter table users
cluster on users_pkey;
