
create table if not exists private_users (
     id text not null primary key,
     data jsonb not null,
     fs_updated_time timestamp not null,
     weekly_trending_email_sent boolean default false,
     weekly_portfolio_email_sent boolean default false
);

alter table private_users enable row level security;

drop policy if exists "private read" on private_users;
create policy "private read" on private_users for select
    using (firebase_uid() = id);

alter table private_users cluster on private_users_pkey;
