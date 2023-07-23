create index if not exists user_contract_metrics_recent_bets on user_contract_metrics (user_id, ((data -> 'lastBetTime')::bigint) desc);

create index if not exists user_contract_metrics_weekly_profit on user_contract_metrics ((data -> 'from' -> 'week' -> 'profit'))
where
  (data -> 'from' -> 'week' -> 'profit') is not null;

create index idx_user_contract_metrics_contract_profit on user_contract_metrics (contract_id, profit);
