create index if not exists user_contract_metrics_gin on user_contract_metrics using GIN (data);

create index if not exists user_contract_metrics_recent_bets on user_contract_metrics (user_id, ((data -> 'lastBetTime')::bigint) desc);

create index if not exists user_contract_metrics_weekly_profit on user_contract_metrics ((data -> 'from' -> 'week' -> 'profit'))
where
  (data -> 'from' -> 'week' -> 'profit') is not null;

create index if not exists idx_user_contract_metrics_contract_has_yes_shares on user_contract_metrics (contract_id)
where
  has_yes_shares = true;

create index idx_user_contract_metrics_contract_yes_shares on user_contract_metrics (contract_id, has_yes_shares);

create index idx_user_contract_metrics_contract_no_shares on user_contract_metrics (contract_id, has_no_shares);

create index idx_user_contract_metrics_contract_profit on user_contract_metrics (contract_id, profit);
