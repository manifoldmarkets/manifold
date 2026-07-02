-- Track whether the "new prize drawing started" announcement notification
-- has been sent for a given sweepstakes. Admin-triggered, once per drawing.
alter table sweepstakes
  add column if not exists announcement_sent boolean not null default false;
