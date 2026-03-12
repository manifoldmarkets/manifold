-- Trophy system tables

-- Permanent claimed milestones (claim once, keep forever)
create table if not exists user_trophy_claims (
    user_id    text         not null references users(id),
    trophy_id  text         not null,
    milestone  text         not null,
    claimed_at timestamptz  not null default now(),
    primary key (user_id, trophy_id)
);

-- Profile showcase pins (up to 3 badge IDs per user)
create table if not exists user_showcase (
    user_id    text    primary key references users(id),
    pins       text[]  not null default '{}',
    updated_at timestamptz not null default now()
);

-- RLS policies
alter table user_trophy_claims enable row level security;
alter table user_showcase enable row level security;

-- Public read for both (anyone can see trophies/pins on profiles)
create policy "public read" on user_trophy_claims for select using (true);
create policy "public read" on user_showcase for select using (true);

-- No write policies needed — backend uses createSupabaseDirectClient()
-- which connects as service_role and bypasses RLS entirely.
-- Omitting write policies means anon/authenticated keys cannot modify these tables.
