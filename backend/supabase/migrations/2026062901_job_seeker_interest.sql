-- Users who opt in to being contacted about jobs via the /jobs board.
--
-- One row per user, upserted by the set-job-interest endpoint. skills and
-- interests hold controlled-vocabulary slugs from common/src/job-seeker.ts,
-- so pitch-time counts like "N people open to trading roles" are clean and
-- queryable:
--   select count(*) from job_seeker_interest
--   where open_to_contact and 'trading-quant' = any(skills);

create table if not exists
  job_seeker_interest (
    user_id text primary key references users (id),
    skills text[] not null default array[]::text[],
    interests text[] not null default array[]::text[],
    region text,
    open_to_contact boolean not null default true,
    created_time timestamptz not null default now(),
    updated_time timestamptz not null default now()
  );

-- GIN indexes so `'tag' = any(skills)` / `&&` containment counts are fast.
create index if not exists job_seeker_interest_skills_idx
  on job_seeker_interest using gin (skills);

create index if not exists job_seeker_interest_interests_idx
  on job_seeker_interest using gin (interests);

-- Belt-and-suspenders for dev DBs created before `region` was added (no-op on
-- fresh installs, where the create-table above already includes it).
alter table job_seeker_interest
  add column if not exists region text;

alter table job_seeker_interest enable row level security;
