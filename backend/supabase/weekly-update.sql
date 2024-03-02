create table
  weekly_update (
    id text not null default random_alphanumeric (12) primary key,
    user_id text not null references users (id),
    contract_metrics json not null,
    profit numeric not null,
    range_end date not null,
    created_time timestamptz not null default now()
  );

alter table weekly_update enable row level security;

drop policy if exists "public read" on weekly_update;

create policy "public read" on weekly_update for
select
  using (true);
