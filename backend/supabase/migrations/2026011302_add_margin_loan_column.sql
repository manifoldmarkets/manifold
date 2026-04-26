-- Add margin_loan column to user_contract_metrics table for interest-bearing loans
alter table user_contract_metrics
add column if not exists margin_loan numeric default 0 not null;
