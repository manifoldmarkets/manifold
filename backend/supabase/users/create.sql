create table if not exists
  users (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null,
    name text not null,
    username text not null,
    name_username_vector tsvector generated always as (to_tsvector(name || ' ' || username)) stored
  );

alter table users
cluster on users_pkey;
