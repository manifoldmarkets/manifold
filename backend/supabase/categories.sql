create table if not exists
  categories (
    id bigint primary key generated always as identity not null,
    user_id text not null,
    name text not null,
    color text,
    display_order integer default 0 not null,
    archived boolean default false not null,
    created_time timestamp with time zone default now() not null
  );

-- Row Level Security
alter table categories enable row level security;

-- Policies
create policy "public read" on categories for
select
  using (true);

-- Indexes
create index categories_user_id_idx on categories (user_id);
