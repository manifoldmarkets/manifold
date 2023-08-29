create index if not exists user_contract_metrics_recent_bets on user_contract_metrics (user_id, ((data -> 'lastBetTime')::bigint) desc);

create index idx_user_contract_metrics_contract_profit on user_contract_metrics (contract_id, profit);

create index contract_metrics_no_shares  on user_contract_metrics
    (contract_id, total_shares_no desc)
    where total_shares_no is not null;

create index contract_metrics_yes_shares  on user_contract_metrics
    (contract_id, total_shares_yes desc)
    where total_shares_yes is not null;