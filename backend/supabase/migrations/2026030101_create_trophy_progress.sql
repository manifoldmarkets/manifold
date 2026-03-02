-- Trophy progress table: tracks per-user, per-trophy milestone progress.
-- Updated nightly by scheduler job. Claimed tiers are set by the claim-trophy-tier API.

create table if not exists user_trophy_progress (
  user_id text not null references users(id),
  trophy_id text not null,
  current_value numeric not null default 0,
  highest_claimed_tier text,
  last_claimed_time timestamptz,
  last_updated timestamptz not null default now(),
  primary key (user_id, trophy_id)
);

alter table user_trophy_progress enable row level security;

create policy "public read trophy progress"
  on user_trophy_progress for select using (true);

create index idx_trophy_progress_user
  on user_trophy_progress(user_id);
