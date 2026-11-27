-- Trophy ladders v2: net worth peaks, nightly rank snapshots, rank peaks and
-- the accounts kept out of ranks.
-- Run after 2026112501_user_reactions_comment_likes_idx.sql, then deploy the
-- API and main scheduler, then web. If a lock times out, rerun this migration.
begin;

set
  local lock_timeout = '5s';

create table if not exists
  trophy_rank_exclusions (
    user_id text primary key references users (id) on delete cascade,
    reason text not null,
    created_time timestamptz not null default now()
  );

insert into
  trophy_rank_exclusions (user_id, reason)
select
  u.id,
  'House, organisation or partner account'
from
  (
    values
      ('pyBueUg9y3hrDIUtrus5uAkPHCr1'), -- Manifund
      ('IPTOzEqrpkWmEzh6hwvAyY9PqFb2'), -- Manifold
      ('NnVY8olowYMYQGr346dfmHXBSpx2'), -- ManifoldSports
      ('vuI5upWB8yU00rP7yxj95J2zd952'), -- ManifoldPolitics
      ('0YOMCbJas0UqJdlrqKe1MrQewrF2'), -- MNX
      ('byEds8x9SMYgX0BuPMufdcpbSIH2') -- predyx_markets
  ) as excluded (id)
  join users u on u.id = excluded.id
on conflict do nothing;

create table if not exists
  user_net_worth_peaks (
    user_id text primary key references users (id) on delete cascade,
    peak_net_worth numeric not null check (
      peak_net_worth > 0
      and peak_net_worth < 'Infinity'::numeric
    ),
    peak_time timestamptz not null
  );

create table if not exists
  trophy_ranks (
    trophy_id text not null,
    user_id text not null references users (id) on delete cascade,
    value numeric not null check (
      value > '-Infinity'::numeric
      and value < 'Infinity'::numeric
    ),
    rank int not null check (rank between 1 and 25),
    computed_time timestamptz not null,
    primary key (trophy_id, user_id)
  );

create index if not exists trophy_ranks_user_id on trophy_ranks (user_id);

create table if not exists
  trophy_rank_state (
    id boolean primary key default true check (id),
    computed_time timestamptz not null
  );

create table if not exists
  user_trophy_rank_peaks (
    user_id text not null references users (id) on delete cascade,
    trophy_id text not null,
    best_rank int not null check (best_rank between 1 and 25),
    first_ranked_time timestamptz not null,
    best_rank_time timestamptz not null,
    primary key (user_id, trophy_id)
  );

alter table trophy_rank_exclusions enable row level security;

alter table user_net_worth_peaks enable row level security;

alter table trophy_ranks enable row level security;

alter table trophy_rank_state enable row level security;

alter table user_trophy_rank_peaks enable row level security;

drop policy if exists "public read" on trophy_ranks;

create policy "public read" on trophy_ranks for
select
  using (true);

drop policy if exists "public read" on trophy_rank_state;

create policy "public read" on trophy_rank_state for
select
  using (true);

drop policy if exists "public read" on user_trophy_rank_peaks;

create policy "public read" on user_trophy_rank_peaks for
select
  using (true);

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on trophy_rank_exclusions, user_net_worth_peaks, trophy_ranks, trophy_rank_state, user_trophy_rank_peaks from %I', r);
      execute format('grant select on trophy_ranks, user_trophy_rank_peaks, trophy_rank_state to %I', r);
    end if;
  end loop;
end
$$;

commit;
