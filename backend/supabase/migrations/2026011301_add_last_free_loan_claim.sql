-- Add last_free_loan_claim column to users table for tracking daily free loan claims
-- Wrapped in DO block to skip gracefully if table doesn't exist yet (local dev)
do $$
begin
  alter table users add column if not exists last_free_loan_claim timestamptz;
exception when undefined_table then null;
end $$;
