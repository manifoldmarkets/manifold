create table if not exists
  users (
    id text not null primary key,
    data jsonb not null,
    fs_updated_time timestamp not null,
    name text not null,
    created_time timestamptz,
    username text not null,
    name_username_vector tsvector generated always as (to_tsvector('english', name || ' ' || username)) stored,
    balance numeric not null default 0,
    spice_balance numeric not null default 0,
    total_deposits numeric not null default 0
  );

alter table users
cluster on users_pkey;

create index if not exists users_name_idx on users (name);

create index if not exists user_username_idx on users (username);

create index users_name_username_vector_idx on users using gin (name_username_vector);

create index if not exists user_referrals_idx on users ((data ->> 'referredByUserId'))
where
  data ->> 'referredByUserId' is not null;

create index if not exists users_betting_streak_idx on users (((data -> 'currentBettingStreak')::int));

create index if not exists users_created_time on users (created_time desc);

alter table users enable row level security;

drop policy if exists "public read" on users;

create policy "public read" on users for
select
  using (true);

create
or replace function users_populate_cols () returns trigger language plpgsql as $$ begin
    if new.data is not null then
        new.name := (new.data)->>'name';
        new.username := (new.data)->>'username';
        new.created_time := case when new.data ? 'createdTime' then millis_to_ts(((new.data)->>'createdTime')::bigint) else null end;
        new.balance := ((new.data)->'balance')::numeric;
        new.spice_balance := ((new.data)->'spiceBalance')::numeric;
        new.total_deposits := ((new.data)->'totalDeposits')::numeric;
    end if;
    return new;
end $$;

create trigger users_popuate before insert
or
update on users for each row
execute function users_populate_cols ();
