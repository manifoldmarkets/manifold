-- The txn that paid a claimed milestone's reward, if it had one. claim-trophy
-- inserts the claim rows and pays in one transaction, so a milestone pays at
-- most once; unclaim-trophy keeps rows that were paid, so a later claim of
-- the same milestone cannot pay again.
alter table user_trophy_milestones
add column if not exists reward_txn_id text;
