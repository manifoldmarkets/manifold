
create table if not exists
    user_quest_metrics (
                           user_id text not null,
                           score_id text not null,
                           score_value numeric not null,
                           idempotency_key text,
                           primary key (user_id, score_id)
);

alter table user_quest_metrics enable row level security;

drop policy if exists "public read" on user_quest_metrics;

create policy "public read" on user_quest_metrics for
    select
    using (true);

alter table user_quest_metrics
    cluster on user_quest_metrics_pkey;
