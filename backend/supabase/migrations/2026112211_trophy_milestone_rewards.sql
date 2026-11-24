-- Rewards paid for claimed "Getting started" milestones: one row per
-- (user, trophy, milestone) ever paid. claim-trophy inserts the row and pays
-- in one transaction, paying only for rows it inserted, so a milestone pays at
-- most once. No API path deletes these rows (an admin unclaim deletes claims,
-- not rewards), so unclaiming and claiming again, or a deploy that runs older
-- code alongside, cannot pay a milestone twice.
create table if not exists
  user_trophy_rewards (
    user_id text not null references users (id) on delete cascade,
    trophy_id text not null,
    milestone_id text not null,
    -- Set in the same transaction, once the payout txn exists.
    txn_id text,
    created_time timestamp with time zone default now() not null,
    primary key (user_id, trophy_id, milestone_id)
  );

-- No policies: only the API, as the service role, reads or writes it.
alter table user_trophy_rewards enable row level security;
