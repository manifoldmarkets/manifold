-- Add margin_loan column to user_contract_metrics table for interest-bearing loans
-- Wrapped in DO block to skip gracefully if table doesn't exist yet (local dev)
do $$
begin
  alter table user_contract_metrics add column if not exists margin_loan numeric default 0 not null;
exception when undefined_table then null;
end $$;
