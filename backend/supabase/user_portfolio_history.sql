
create table if not exists
    user_portfolio_history (
                               id bigint generated always as identity primary key,
                               user_id text not null,
                               ts timestamp not null,
                               investment_value numeric not null,
                               balance numeric not null,
                               total_deposits numeric not null,
                               loan_total numeric
);

alter table user_portfolio_history enable row level security;

drop policy if exists "public read" on user_portfolio_history;

create policy "public read" on user_portfolio_history for
    select
    using (true);

create index if not exists user_portfolio_history_user_ts on user_portfolio_history (user_id, ts desc);

alter table user_portfolio_history
    cluster on user_portfolio_history_user_ts;

