
create table if not exists
    txn_summary_stats
(
    id               bigint generated always as identity primary key,
    created_time     timestamptz not null default now(),
    start_time       timestamptz not null,
    end_time         timestamptz not null,
    from_type        text        not null,
    to_type          text        not null,
    token            text        not null,
    quest_type       text,
    category         text        not null,
    total_amount     numeric     not null
);

alter table txn_summary_stats enable row level security;
create policy "public read" on txn_summary_stats for
    select
    using (true);
