-- Trophy ladders v2: net worth peaks, nightly rank snapshots, rank peaks and
-- the accounts kept out of ranks.
-- Run after 2026112501_user_reactions_comment_likes_idx.sql, then deploy the
-- API and main scheduler, then web.
begin;

create table if not exists
  trophy_rank_exclusions (
    user_id text primary key references users (id) on delete cascade,
    reason text not null,
    created_time timestamptz not null default now()
  );

insert into
  trophy_rank_exclusions (user_id, reason)
select
  id,
  'House or organisation account'
from
  users
where
  username in (
    'Manifund',
    'Manifold',
    'ManifoldSports',
    'ManifoldPolitics'
  )
on conflict do nothing;

create table if not exists
  user_net_worth_peaks (
    user_id text primary key references users (id) on delete cascade,
    peak_net_worth numeric not null,
    peak_time timestamptz not null
  );

create table if not exists
  trophy_ranks (
    trophy_id text not null,
    user_id text not null references users (id) on delete cascade,
    value numeric not null,
    rank int not null check (rank between 1 and 25),
    computed_time timestamptz not null,
    primary key (trophy_id, user_id)
  );

create index if not exists trophy_ranks_user_id on trophy_ranks (user_id);

create table if not exists
  user_trophy_rank_peaks (
    user_id text not null references users (id) on delete cascade,
    trophy_id text not null,
    best_rank int not null check (best_rank >= 1),
    first_ranked_time timestamptz not null,
    best_rank_time timestamptz not null,
    primary key (user_id, trophy_id)
  );

alter table trophy_rank_exclusions enable row level security;

alter table user_net_worth_peaks enable row level security;

alter table trophy_ranks enable row level security;

alter table user_trophy_rank_peaks enable row level security;

drop policy if exists "public read" on trophy_ranks;

create policy "public read" on trophy_ranks for
select
  using (true);

drop policy if exists "public read" on user_trophy_rank_peaks;

create policy "public read" on user_trophy_rank_peaks for
select
  using (true);

commit;
