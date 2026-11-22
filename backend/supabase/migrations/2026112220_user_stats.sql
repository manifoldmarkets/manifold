-- Live per-user stats, kept by the database in the same transaction as the
-- write that changes them. First stat: trades (see user_stats_bet_trades).
-- Design and rollout: dev-docs/user-stats.md. Deploy the API first, so no
-- running server writes full-set redemption legs without isAutoRedemption.
-- Apply 2026112219_contracts_guards.sql before this install. After the
-- backfill completes, apply 2026112221 and then deploy web.
--
-- One transaction. It briefly blocks writes to contract_bets while it
-- installs the triggers; if a write holds the table for more than 5 seconds
-- it gives up, and the file can be run again (stop the backfill first if it
-- has started).
begin;

set local lock_timeout = '5s';

-- The bound below is written into a function as text; ISO keeps that text
-- unambiguous for every session that reads it.
set local datestyle = 'ISO, YMD';

-- First, before touching anything a bet's trigger uses: no writes to
-- contract_bets from here to commit, and no lock-order clash with a bet that
-- is already writing.
lock table contract_bets in share row exclusive mode;

-- One row per user with a counted trade since the install. Only the primary
-- key is indexed, so the per-bet increments are HOT updates; the fill factor
-- leaves room on each page for them. Only the triggers write it.
create table if not exists user_stats (
  user_id text primary key,
  trades integer not null default 0,
  updated_time timestamptz not null default now()
) with (fillfactor = 80);

-- The trades made before the install, added by the backfill
-- (backend/scripts/backfill-user-stats.ts). Kept apart from user_stats so
-- the backfill never writes a row a bet transaction also writes: a bet can't
-- wait on it or fail to serialize because of it. A user's count is the sum
-- of their rows in both tables.
create table if not exists user_stats_baseline (
  user_id text primary key,
  trades integer not null default 0
);

-- Whether a contract_bets row counts as a trade: a bet in a mana market (checked
-- by the caller) whose filled amount is not zero, placed by a person (not via
-- the API), and not a redemption, including the automatic sell legs that
-- redeem a full set of a multiple-choice market (isAutoRedemption in data).
-- A limit order counts once, when it first fills; a market buy or sell counts
-- at once.
create or replace function user_stats_bet_trades (
  amount numeric,
  is_redemption boolean,
  is_api boolean,
  is_auto_redemption boolean
) returns integer language sql immutable parallel safe as $$
  select case
    when amount <> 0
      and is_redemption is not true
      and is_api is not true
      and is_auto_redemption is not true
    then 1 else 0 end
$$;

-- Backfill support. While the backfill adds up history, the first time a bet
-- that existed when the triggers were installed changes or is deleted, its
-- state at that moment is saved here, and a bet that comes to be dated at or
-- before the bound after the install (inserted, or moved there) is recorded
-- as not having existed. The backfill then counts each bet dated at or before
-- the bound exactly once, as it was at the install; the triggers count every
-- change since. Dropped, with the saving step of the triggers, once the
-- backfill is done (a later migration).
create table if not exists user_stats_bet_journal (
  bet_id text primary key,
  user_id text not null,
  contract_id text not null,
  created_time timestamptz not null,
  -- false: did not exist at the install; the remaining columns are null.
  existed boolean not null,
  amount numeric,
  is_redemption boolean,
  is_api boolean,
  is_auto_redemption boolean
);

create index if not exists user_stats_bet_journal_created_time on user_stats_bet_journal (created_time);
-- Market creation also checks ids that survive only in the journal.
create index if not exists user_stats_bet_journal_contract_id on user_stats_bet_journal (contract_id);

-- Progress of the backfill, one row per stat.
create table if not exists user_stats_backfill (
  stat text primary key,
  -- The newest created_time in contract_bets at the install. Every bet that
  -- existed then is dated at or before it.
  bound timestamptz not null,
  -- Every bet dated before this has been added (null: not started).
  done_before timestamptz,
  completed_time timestamptz,
  updated_time timestamptz not null default now()
);

-- Readable by everyone through RLS; written only by the server (which
-- bypasses RLS). TRUNCATE ignores RLS, so the API roles keep nothing but
-- SELECT on the two count tables and nothing at all on the others.
do $$
declare
  t text;
begin
  -- Only when missing: each of these takes the table's strongest lock.
  foreach t in array array['user_stats', 'user_stats_baseline', 'user_stats_bet_journal', 'user_stats_backfill'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
  foreach t in array array['user_stats', 'user_stats_baseline'] loop
    if not exists (
      select 1 from pg_policies where tablename = t and policyname = 'public read'
    ) then
      execute format('create policy "public read" on %I for select using (true)', t);
    end if;
  end loop;
end
$$;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on user_stats, user_stats_baseline, user_stats_bet_journal, user_stats_backfill from %I', r);
      execute format('grant select on user_stats, user_stats_baseline to %I', r);
    end if;
  end loop;
end
$$;

-- The bound is written into a function rather than read from
-- user_stats_backfill by the triggers: a serializable bet transaction that
-- started before this commits would not see that row, but always runs the
-- current trigger and function definitions. Running this file again keeps
-- the bound it recorded the first time.
do $$
declare
  b timestamptz;
begin
  select bound into b from user_stats_backfill where stat = 'trades';
  if b is null then
    select max(created_time) into b from contract_bets;
    b := coalesce(b, now());
    insert into user_stats_backfill (stat, bound) values ('trades', b);
  end if;
  execute format(
    'create or replace function user_stats_bet_bound() returns timestamptz '
    'language sql immutable parallel safe as $f$ select %L::timestamptz $f$',
    b
  );
end
$$;

-- The first journal entry for an id wins. Save the old image before its id
-- is freed, and mark a backdated insert or move before a nested statement can
-- update or delete it. contract_bet_populate returns new.
create or replace function user_stats_journal_bet () returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' and old.created_time <= user_stats_bet_bound() then
    insert into user_stats_bet_journal (
      bet_id, user_id, contract_id, created_time, existed,
      amount, is_redemption, is_api, is_auto_redemption
    ) values (
      old.bet_id, old.user_id, old.contract_id, old.created_time, true,
      old.amount, old.is_redemption, old.is_api,
      coalesce(old.data ->> 'isAutoRedemption' = 'true', false)
    )
    on conflict (bet_id) do nothing;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.created_time <= user_stats_bet_bound() then
    if tg_op = 'INSERT' then
      -- A row with this id already there means this insert either fails on
      -- the key or takes the upsert update path, whose before update trigger
      -- saves that row's image: no marker. The lock makes that exact. A
      -- concurrent delete of the row holds a conflicting lock, so this waits;
      -- after it commits, read committed finds no row and writes the marker
      -- (serializable fails to serialize and retries). A row found stays
      -- locked, so it can't be deleted and its id reused by this insert.
      perform 1 from contract_bets where bet_id = new.bet_id for key share;
      if found then
        return new;
      end if;
    end if;
    insert into user_stats_bet_journal (bet_id, user_id, contract_id, created_time, existed)
    values (new.bet_id, new.user_id, new.contract_id, new.created_time, false)
    on conflict (bet_id) do nothing;
  end if;
  return new;
end
$$;

-- Under read committed the lookup gets a fresh snapshot. At higher isolation
-- a market committed after the snapshot is invisible until the caller retries.
create or replace function user_stats_missing_market (market_id text) returns void language plpgsql as $$
begin
  if current_setting('transaction_isolation') = 'read committed' then
    raise exception 'bet names market "%", which does not exist. bets must be written after their market', market_id;
  end if;
  raise exception 'transaction snapshot predates market "%". retry the transaction with a fresh snapshot', market_id
    using errcode = 'serialization_failure';
end
$$;

create or replace function user_stats_bets_inserted () returns trigger language plpgsql as $$
declare
  missing_market text;
begin
  -- The counting join would silently skip bets whose markets are invisible.
  -- Check the statement as a set. The contract guards keep every visible
  -- market's id and token fixed and prevent deletion, so no row lock is needed.
  select m.contract_id into missing_market
  from (select distinct contract_id from new_bets) m
  where not exists (select 1 from contracts c where c.id = m.contract_id)
  limit 1;
  if found then
    perform user_stats_missing_market(missing_market);
  end if;

  -- A backstop for the before insert marker, for rows actually inserted (an
  -- upsert that took the update path isn't in new_bets). It adds nothing in
  -- any case we know of, and new bets are never at or before the bound.
  insert into user_stats_bet_journal (bet_id, user_id, contract_id, created_time, existed)
  select n.bet_id, n.user_id, n.contract_id, n.created_time, false
  from new_bets n
  where n.created_time <= user_stats_bet_bound()
  on conflict (bet_id) do nothing;

  insert into user_stats as s (user_id, trades, updated_time)
  select n.user_id, count(*), now()
  from new_bets n
  join contracts c on c.id = n.contract_id and c.token = 'MANA'
  where user_stats_bet_trades(
    n.amount, n.is_redemption, n.is_api,
    coalesce(n.data ->> 'isAutoRedemption' = 'true', false)
  ) = 1
  group by n.user_id
  order by n.user_id
  on conflict (user_id) do update
    set trades = s.trades + excluded.trades, updated_time = excluded.updated_time;
  return null;
end
$$;

-- An update counts as the old row removed and the new one added, each for its
-- own user and contract, so a change of user, contract or flags is counted
-- right. Most updates (later fills, cancellations, expiries) change nothing
-- and write nothing.
create or replace function user_stats_bets_updated () returns trigger language plpgsql as $$
begin
  insert into user_stats as s (user_id, trades, updated_time)
  select d.user_id, sum(d.trades), now()
  from (
    select n.user_id, 1 as trades
    from new_bets n
    join contracts c on c.id = n.contract_id and c.token = 'MANA'
    where user_stats_bet_trades(
      n.amount, n.is_redemption, n.is_api,
      coalesce(n.data ->> 'isAutoRedemption' = 'true', false)
    ) = 1
    union all
    select o.user_id, -1 as trades
    from old_bets o
    join contracts c on c.id = o.contract_id and c.token = 'MANA'
    where user_stats_bet_trades(
      o.amount, o.is_redemption, o.is_api,
      coalesce(o.data ->> 'isAutoRedemption' = 'true', false)
    ) = 1
  ) d
  group by d.user_id
  having sum(d.trades) <> 0
  order by d.user_id
  on conflict (user_id) do update
    set trades = s.trades + excluded.trades, updated_time = excluded.updated_time;
  return null;
end
$$;

create or replace function user_stats_bets_deleted () returns trigger language plpgsql as $$
begin
  insert into user_stats as s (user_id, trades, updated_time)
  select o.user_id, -count(*), now()
  from old_bets o
  join contracts c on c.id = o.contract_id and c.token = 'MANA'
  where user_stats_bet_trades(
    o.amount, o.is_redemption, o.is_api,
    coalesce(o.data ->> 'isAutoRedemption' = 'true', false)
  ) = 1
  group by o.user_id
  order by o.user_id
  on conflict (user_id) do update
    set trades = s.trades + excluded.trades, updated_time = excluded.updated_time;
  return null;
end
$$;

-- TRUNCATE skips the delete trigger, so the counts would silently go wrong.
create or replace function user_stats_bets_truncated () returns trigger language plpgsql as $$
begin
  raise exception 'contract_bets feeds user_stats: delete rows instead of truncating, or rebuild user_stats';
end
$$;

-- create or replace (not drop and create): running this file again needs
-- only the share row exclusive lock taken above.
-- The bound goes into every WHEN clause as a literal. PostgreSQL doesn't
-- plan a trigger's WHEN, so calling user_stats_bet_bound() there would run
-- the SQL function even for new bets outside the journal's range
-- (measured: cancelling 5,000 new orders went from 160 ms to 262 ms).
do $$
declare
  b timestamptz := user_stats_bet_bound();
begin
  execute format(
    'create or replace trigger user_stats_before_bet_insert '
    'before insert on contract_bets '
    'for each row when (new.created_time <= %L::timestamptz) '
    'execute function user_stats_journal_bet ()',
    b
  );
  execute format(
    'create or replace trigger user_stats_before_bet_update '
    'before update on contract_bets '
    'for each row when (old.created_time <= %L::timestamptz or new.created_time <= %L::timestamptz) '
    'execute function user_stats_journal_bet ()',
    b, b
  );
  execute format(
    'create or replace trigger user_stats_before_bet_delete '
    'before delete on contract_bets '
    'for each row when (old.created_time <= %L::timestamptz) '
    'execute function user_stats_journal_bet ()',
    b
  );
end
$$;

-- Check each reassignment, even if another updated row already names the id.
-- This trigger sorts after contract_bet_populate. Fills and cancels update
-- data alone, so they skip the check even on historical orphan bets.
create or replace function user_stats_check_bet_market () returns trigger language plpgsql as $$
begin
  if not exists (select 1 from contracts where id = new.contract_id) then
    perform user_stats_missing_market(new.contract_id);
  end if;
  return new;
end
$$;

create or replace trigger user_stats_check_bet_market
before update of contract_id on contract_bets
for each row when (old.contract_id is distinct from new.contract_id)
execute function user_stats_check_bet_market ();

create or replace trigger user_stats_bets_inserted
after insert on contract_bets
referencing new table as new_bets
for each statement execute function user_stats_bets_inserted ();

create or replace trigger user_stats_bets_updated
after update on contract_bets
referencing old table as old_bets new table as new_bets
for each statement execute function user_stats_bets_updated ();

create or replace trigger user_stats_bets_deleted
after delete on contract_bets
referencing old table as old_bets
for each statement execute function user_stats_bets_deleted ();

create or replace trigger user_stats_bets_truncated
before truncate on contract_bets
for each statement execute function user_stats_bets_truncated ();

commit;
