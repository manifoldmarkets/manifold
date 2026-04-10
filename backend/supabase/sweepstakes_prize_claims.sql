-- Prize claims table for sweepstakes winners
-- Stores winner's wallet address and payment status
-- This data should NOT be publicly accessible
create table if not exists
  sweepstakes_prize_claims (
    id uuid primary key default gen_random_uuid (),
    sweepstakes_num integer not null references sweepstakes (sweepstakes_num),
    user_id text not null references users (id),
    rank integer not null,
    prize_amount_usdc numeric not null,
    wallet_address text not null,
    payment_status text not null default 'awaiting' check (
      payment_status in ('awaiting', 'sent', 'rejected')
    ),
    payment_txn_hash text,
    created_time timestamptz not null default now(),
    updated_time timestamptz not null default now(),
    unique (sweepstakes_num, user_id)
  );

-- Enable RLS - NO public access
alter table sweepstakes_prize_claims enable row level security;

-- Only allow service role to access (no public read/write)
-- Users will access via API endpoints that verify authorization
drop policy if exists "admin read" on sweepstakes_prize_claims;

create policy "admin read" on sweepstakes_prize_claims for
select
  to service_role using (true);

drop policy if exists "admin write" on sweepstakes_prize_claims;

create policy "admin write" on sweepstakes_prize_claims for all to service_role using (true);

-- Indexes
drop index if exists sweepstakes_prize_claims_user_id;

create index sweepstakes_prize_claims_user_id on sweepstakes_prize_claims (user_id);

drop index if exists sweepstakes_prize_claims_sweepstakes_num;

create index sweepstakes_prize_claims_sweepstakes_num on sweepstakes_prize_claims (sweepstakes_num);

drop index if exists sweepstakes_prize_claims_status;

create index sweepstakes_prize_claims_status on sweepstakes_prize_claims (payment_status);
