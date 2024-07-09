create table if not exists
  users (
    id text not null primary key default random_alphanumeric (12),
    data jsonb not null,
    name text not null,
    created_time timestamptz not null default now(),
    username text not null,
    name_username_vector tsvector generated always as (to_tsvector('english', name || ' ' || username)) stored,
    balance numeric not null default 0,
    spice_balance numeric not null default 0,
    total_deposits numeric not null default 0,
    resolved_profit_adjustment numeric
  );

alter table users
cluster on users_pkey;

create index if not exists users_name_idx on users (name);

create index if not exists user_username_idx on users (username);

create index users_name_username_vector_idx on users using gin (name_username_vector);

create index if not exists user_referrals_idx on users ((data ->> 'referredByUserId'))
where
  data ->> 'referredByUserId' is not null;

create index if not exists users_created_time on users (created_time desc);

alter table users enable row level security;

drop policy if exists "public read" on users;

create policy "public read" on users for
select
  using (true);
