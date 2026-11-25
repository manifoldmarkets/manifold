-- Trophies: one row per claimed milestone, and up to three profile pins.
--
-- Replaces the unshipped user_trophy_claims design (one row per trophy holding
-- only the highest milestone). That table was created on dev only and is not
-- read by this code; it can be dropped there by hand.
--
-- Ids come from common/src/trophies.ts (TrophyDefinition.id, TrophyMilestone.id).
-- A claim is never updated, so the primary key makes claiming idempotent and
-- safe under concurrent requests, and lets a later reward be paid once per row.
create table if not exists
  user_trophy_milestones (
    user_id text not null references users (id) on delete cascade,
    trophy_id text not null,
    milestone_id text not null,
    claimed_time timestamp with time zone default now() not null,
    primary key (user_id, trophy_id, milestone_id)
  );

-- Pins are "trophy-<trophy id>" or "league". set-showcase-pins checks them
-- against the user's claims and unlocked slots.
create table if not exists
  user_showcase (
    user_id text primary key references users (id) on delete cascade,
    pins text[] default '{}' not null check (cardinality(pins) <= 3),
    updated_at timestamp with time zone default now() not null
  );

-- Public read, as profiles are public. No write policies: the API writes with
-- the service role.
alter table user_trophy_milestones enable row level security;

alter table user_showcase enable row level security;

drop policy if exists "public read" on user_trophy_milestones;

create policy "public read" on user_trophy_milestones for
select
  using (true);

drop policy if exists "public read" on user_showcase;

create policy "public read" on user_showcase for
select
  using (true);
