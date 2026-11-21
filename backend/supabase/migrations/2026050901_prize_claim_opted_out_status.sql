-- Add 'opted_out' as a valid payment_status, and allow wallet_address to be
-- NULL on sweepstakes_prize_claims rows.
--
-- Why: when a winner forfeits their crypto prize (e.g. donates the equivalent
-- to charity instead), we still need a row to record that decision so admins
-- can mark them as resolved. Until now, no row existed for users who never
-- submitted a wallet, and 'rejected' was the only non-success status —
-- conflating "ineligible" and "voluntarily forfeited". This adds an explicit
-- 'opted_out' status and lets the row exist without a wallet address.

alter table sweepstakes_prize_claims
  drop constraint if exists sweepstakes_prize_claims_payment_status_check;

alter table sweepstakes_prize_claims
  add constraint sweepstakes_prize_claims_payment_status_check
  check (payment_status in ('awaiting', 'sent', 'rejected', 'opted_out'));

alter table sweepstakes_prize_claims
  alter column wallet_address drop not null;
