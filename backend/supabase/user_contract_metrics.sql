create table if not exists
    user_contract_metrics (
      id bigint generated always as identity primary key,
      user_id text not null,
      contract_id text not null,
      data jsonb not null,
      fs_updated_time timestamp,
      has_yes_shares boolean,
      has_no_shares boolean,
      total_shares_yes numeric,
      total_shares_no numeric,
      profit numeric,
      has_shares boolean,
      answer_id text
  );

alter table user_contract_metrics enable row level security;

drop policy if exists "public read" on user_contract_metrics;

create policy "public read" on user_contract_metrics for
    select
    using (true);

alter table user_contract_metrics
    cluster on user_contract_metrics_pkey;

create unique index unique_user_contract_answer
    on user_contract_metrics (user_id, contract_id, coalesce(answer_id, ''));

create index if not exists user_contract_metrics_recent_bets on user_contract_metrics (user_id, ((data -> 'lastBetTime')::bigint) desc);

create index idx_user_contract_metrics_contract_profit on user_contract_metrics (contract_id, profit);

create index contract_metrics_no_shares  on user_contract_metrics
    (contract_id, total_shares_no desc)
    where total_shares_no is not null;

create index contract_metrics_yes_shares  on user_contract_metrics
    (contract_id, total_shares_yes desc)
    where total_shares_yes is not null;