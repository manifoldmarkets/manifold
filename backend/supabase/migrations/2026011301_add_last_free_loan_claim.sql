-- Add last_free_loan_claim column to users table for tracking daily free loan claims
alter table users
add column if not exists last_free_loan_claim timestamptz;
