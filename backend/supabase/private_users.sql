create table if not exists
  private_users (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp,
    weekly_trending_email_sent boolean default false,
    weekly_portfolio_email_sent boolean default false
  );

alter table private_users enable row level security;

alter table private_users
cluster on private_users_pkey;

create index if not exists private_users_data_api_key on private_users ((data->>'apiKey'));
