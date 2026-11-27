-- Trophy prizes: what each row of user_trophy_rewards paid. A prize can mix
-- mana, streak freezes and free membership days (common/src/trophy-prizes.ts).
-- Still one row per (user, trophy, milestone) ever paid, inserted in the same
-- transaction as the payout and never deleted, so a prize pays at most once.
--
-- Mana and freezes are paid in that transaction. Membership days can't be:
-- grantMembershipDays takes the user's bet queue slot and its own
-- transaction. The row is written 'pending' and granted after commit, by
-- claim-trophy, the nightly rank job or the scheduler's settle-trophy-prizes
-- sweep. Every path grants under the same membership_grants source id, so a
-- retry can't grant twice. A failed pass backs the account's pending rows off
-- (2, 4, 8... minutes, up to 6 hours) so they can't crowd out the sweep.
--
-- Rank title prizes (Super, Mega) use the same table: trophy_id is the ranked
-- trophy and milestone_id is 'rank:super' or 'rank:mega'. Milestone ids are
-- lower-case letters, digits and hyphens (trophies.test.ts checks), so the
-- colon keeps the two apart.
--
-- Rows from before this migration (starter mana on dev; none on prod) keep
-- null mana and freezes: their amount is on the txn in txn_id.
-- Run before deploying the API. If a lock times out, rerun this migration.
begin;

set
  local lock_timeout = '5s';

alter table user_trophy_rewards
-- Mana paid, after the account's multiplier. 0 when the prize had none.
add column if not exists mana numeric,
add column if not exists freezes integer,
-- The account's effective tier when paid: it sets what the prize was cut to.
add column if not exists effective_tier text,
-- The tier granted. A 'paid-tier' prize stores the tier it resolved to.
add column if not exists membership_tier text,
add column if not exists membership_days integer,
-- none: no membership days in what this account was paid.
-- pending: owed, not granted yet. granted: see membership_outcome.
-- skipped: days of the account's paid tier, and it had no paid membership.
add column if not exists membership_status text not null default 'none',
-- started | banked | capped (the 30-day holding cap left nothing) |
-- duplicate (an earlier attempt's grant, since used up or revoked).
add column if not exists membership_outcome text,
-- What the grant held when it was made: less than the prize if the cap cut it.
add column if not exists membership_granted_ms bigint,
-- membership_grants.id of the receipt the grant left. Null when no grant was
-- made: under an hour of room below the holding cap is recorded as capped.
add column if not exists membership_grant_id bigint,
add column if not exists membership_settled_time timestamptz,
-- Failed passes over this account while the row was pending, and when the
-- sweep may try again. A claim by the account retries at once.
add column if not exists membership_attempts integer not null default 0,
add column if not exists membership_next_attempt_time timestamptz;

alter table user_trophy_rewards
drop constraint if exists user_trophy_rewards_amounts,
drop constraint if exists user_trophy_rewards_membership;

alter table user_trophy_rewards
add constraint user_trophy_rewards_amounts check (
  (
    mana is null
    or (
      mana >= 0
      and mana < 'Infinity'::numeric
    )
  )
  and (
    freezes is null
    or freezes >= 0
  )
),
add constraint user_trophy_rewards_membership check (
  membership_status in ('none', 'pending', 'granted', 'skipped')
  and (
    membership_tier is null
    or membership_tier in ('basic', 'plus', 'premium')
  )
  and (
    membership_status = 'none'
    or coalesce(membership_days, 0) > 0
  )
  and (
    membership_status <> 'none'
    or (
      membership_tier is null
      and membership_days is null
    )
  )
  and (
    membership_status not in ('pending', 'granted')
    or membership_tier is not null
  )
  and (membership_status = 'granted') = (membership_outcome is not null)
  and (
    membership_status <> 'granted'
    or (
      coalesce(membership_granted_ms, -1) >= 0
      and membership_settled_time is not null
    )
  )
  and membership_attempts >= 0
  and (
    membership_outcome is null
    or membership_outcome in ('started', 'banked', 'capped', 'duplicate')
  )
);

-- The retry sweep reads only the few rows still owed.
create index if not exists user_trophy_rewards_membership_pending on user_trophy_rewards (created_time)
where
  membership_status = 'pending';

-- No policies, as before: only the API and scheduler, as the service role,
-- read or write it.
alter table user_trophy_rewards enable row level security;

commit;
