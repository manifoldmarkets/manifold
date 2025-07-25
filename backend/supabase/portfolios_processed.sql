create table if not exists
  portfolios_processed (
    user_id text not null primary key,
    last_processed timestamp with time zone default now() not null
  );

-- Row Level Security
alter table portfolios_processed enable row level security;
