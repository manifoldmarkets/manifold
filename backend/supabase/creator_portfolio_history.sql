create table if not exists
  creator_portfolio_history (
    id bigint generated always as identity primary key,
    user_id text not null,
    ts timestamp not null default now(),
    unique_bettors integer not null,
    fees_earned numeric not null,
    volume numeric not null,
    views integer not null
  );

alter table creator_portfolio_history enable row level security;

drop policy if exists "public read" on creator_portfolio_history;

create policy "public read" on creator_portfolio_history for
select
  using (true);

create index if not exists creator_portfolio_history_user_ts on creator_portfolio_history (user_id, ts desc);

alter table creator_portfolio_history
cluster on creator_portfolio_history_user_ts;
